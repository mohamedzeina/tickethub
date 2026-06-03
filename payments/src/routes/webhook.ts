import express, { Request, Response } from 'express';
import { client } from '@zeina-tickethub/common';
import { stripe } from '../stripe';
import { Payment } from '../models/payment';
import { PaymentCreatedPublisher } from '../events/publishers/payment-created-publisher';
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
				});

				await payment.save();
				// Count unique successful payments (the !existing guard dedups
				// Stripe's at-least-once webhook redelivery).
				paymentsSucceeded.inc();

				await new PaymentCreatedPublisher(natsWrapper.js).publish({
					id: payment.id,
					orderId: payment.orderId,
					stripeId: payment.stripeId,
				});
			}
		} else if (event.type === 'payment_intent.payment_failed') {
			paymentsFailed.inc();
		}

		res.send({ received: true });
	},
);

export { router as paymentWebhookRouter };
