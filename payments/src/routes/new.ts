import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import {
	requireAuth,
	requireVerified,
	validateRequest,
	BadRequestError,
	NotFoundError,
	NotAuthorizedError,
	OrderStatus,
} from '@zeina-tickethub/common';
import { Order } from '../models/order';
import { stripe, CURRENCY } from '../stripe';
import { PaymentInitiatedPublisher } from '../events/publishers/payment-initiated-publisher';
import { natsWrapper } from '../nats-wrapper';

const router = express.Router();

// C3: this route no longer charges the card. It creates a PaymentIntent and
// hands the client_secret back to the browser, which confirms the card with
// Stripe.js. The Payment is recorded (and payment:created published) only once
// Stripe calls back to the webhook with payment_intent.succeeded — so a crash
// between charging and the DB write can no longer lose a paid order.
router.post(
	'/api/payments',
	requireAuth,
	requireVerified,
	[body('orderId').not().isEmpty()],
	validateRequest,
	async (req: Request, res: Response) => {
		const { orderId } = req.body;

		const order = await Order.findById(orderId);

		if (!order) {
			throw new NotFoundError();
		}

		if (order.userId !== req.currentUser!.id) {
			throw new NotAuthorizedError();
		}

		if (order.status === OrderStatus.Cancelled) {
			throw new BadRequestError('Cannot pay for a cancelled order');
		}

		// C2: key the request on the order so a double-submit / refresh replays
		// the same PaymentIntent instead of creating a second one.
		// metadata.orderId lets the webhook map the PaymentIntent back to the order.
		const paymentIntent = await stripe.paymentIntents.create(
			{
				currency: CURRENCY,
				// Multi-seat (#10): charge the per-seat price for every seat reserved.
				amount: order.price * order.quantity * 100,
				metadata: { orderId },
				automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
			},
			{ idempotencyKey: orderId },
		);

		// Tell orders the order is now awaiting payment (Created → AwaitingPayment).
		await new PaymentInitiatedPublisher(natsWrapper.js).publish({ orderId });

		res.status(201).send({ clientSecret: paymentIntent.client_secret });
	},
);

export { router as createChargeRouter };
