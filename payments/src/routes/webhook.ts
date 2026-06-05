import express, { Request, Response } from 'express';
import { client } from '@zeina-tickethub/common';
import { stripe } from '../stripe';
import { Payment } from '../models/payment';
import { Refund } from '../models/refund';
import { PaymentCreatedPublisher } from '../events/publishers/payment-created-publisher';
import { PaymentRefundedPublisher } from '../events/publishers/payment-refunded-publisher';
import { natsWrapper } from '../nats-wrapper';

const router = express.Router();

const paymentsSucceeded = new client.Counter({
	name: 'payments_succeeded_total',
	help: 'Stripe payments that succeeded (recorded via webhook)',
});
const paymentsFailed = new client.Counter({
	name: 'payments_failed_total',
	help: 'Stripe payments that failed (payment_intent.payment_failed)',
});

// Stripe signs each webhook with the endpoint's secret over the *raw* request
// body, so this route parses the body as a Buffer (express.raw) instead of JSON.
// It is registered before the global json() parser in app.ts for that reason.
router.post(
	'/api/payments/webhook',
	express.raw({ type: 'application/json' }),
	async (req: Request, res: Response) => {
		const signature = req.headers['stripe-signature'] as string;

		let event;
		try {
			event = stripe.webhooks.constructEvent(
				req.body,
				signature,
				process.env.STRIPE_WEBHOOK_SECRET!,
			);
		} catch (err) {
			// Bad/missing signature — reject so Stripe (and impostors) get a 400.
			return res
				.status(400)
				.send(`Webhook Error: ${(err as Error).message}`);
		}

		if (event.type === 'payment_intent.succeeded') {
			const paymentIntent = event.data.object as {
				id: string;
				latest_charge?: string;
				metadata: { orderId?: string };
			};
			const orderId = paymentIntent.metadata.orderId;

			// Webhooks can be delivered more than once — only record the payment
			// (and publish payment:created) the first time we see this intent.
			const existing = await Payment.findOne({ stripeId: paymentIntent.id });

			if (orderId && !existing) {
				const payment = Payment.build({
					orderId,
					stripeId: paymentIntent.id,
					// Captured for #11 payouts (source_transaction on the transfer).
					chargeId: paymentIntent.latest_charge,
				});

				try {
					await payment.save();
				} catch (err) {
					// The unique index on stripeId rejects a concurrent redelivery
					// that slipped past the !existing check (race across pods).
					// The winning request already published, so just ack.
					if ((err as { code?: number }).code === 11000) {
						return res.send({ received: true });
					}
					throw err;
				}

				// Count unique successful payments (the !existing guard + unique
				// index dedup Stripe's at-least-once webhook redelivery).
				paymentsSucceeded.inc();

				// The receipt email is now sent by the notifications service off
				// this same payment:created event (centralized comms, #6).
				await new PaymentCreatedPublisher(natsWrapper.js).publish({
					id: payment.id,
					orderId: payment.orderId,
					stripeId: payment.stripeId,
				});
			}
		} else if (event.type === 'payment_intent.payment_failed') {
			paymentsFailed.inc();
		} else if (event.type === 'charge.refunded') {
			// A refund settled. This is the CONFIRMATION (not the optimistic
			// refunds.create return) — publish payment:refunded exactly once so
			// orders flips to Refunded, the pass is revoked, and the buyer is emailed.
			const charge = event.data.object as {
				payment_intent?: string;
				amount_refunded?: number;
			};
			const pi = charge.payment_intent;
			const amount = (charge.amount_refunded ?? 0) / 100;

			if (pi) {
				const payment = await Payment.findOne({ stripeId: pi });
				if (payment) {
					// Stripe delivers webhooks at-least-once, and two deliveries can
					// race (retries, or more than one `stripe listen`). Flip the refund
					// pending->succeeded ATOMICALLY — a requested refund has a pending
					// record; a dashboard refund is upserted. Only the delivery that
					// wins this transition gets a doc back and publishes. A later
					// delivery finds it already 'succeeded', so its upsert-insert hits
					// the unique orderId index (11000) and no-ops — the same
					// at-least-once idempotency the payment_intent.succeeded path has.
					let refund;
					try {
						refund = await Refund.findOneAndUpdate(
							{ orderId: payment.orderId, status: { $ne: 'succeeded' } },
							{
								$set: { status: 'succeeded', amount },
								$setOnInsert: { orderId: payment.orderId, stripeId: pi },
							},
							{ new: true, upsert: true },
						);
					} catch (err) {
						// Unique orderId blocks the insert when another delivery already
						// flipped this refund to succeeded — that one published, so ack.
						if ((err as { code?: number }).code === 11000) {
							return res.send({ received: true });
						}
						throw err;
					}

					await new PaymentRefundedPublisher(natsWrapper.js).publish({
						id: payment.id,
						orderId: payment.orderId,
						stripeId: payment.stripeId,
						amount,
						refundId: refund?.refundId,
					});
				}
			}
		}

		res.send({ received: true });
	},
);

export { router as paymentWebhookRouter };
