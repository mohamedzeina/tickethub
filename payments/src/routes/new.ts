import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import {
	requireAuth,
	validateRequest,
	BadRequestError,
	NotFoundError,
	NotAuthorizedError,
	OrderStatus,
} from '@zeina-tickethub/common';
import { Order } from '../models/order';
import { stripe } from '../stripe';
import { Payment } from '../models/payment';
import { PaymentCreatedPublisher } from '../events/publishers/payment-created-publisher';
import { natsWrapper } from '../nats-wrapper';

const router = express.Router();

router.post(
	'/api/payments',
	requireAuth,
	[body('paymentMethodId').not().isEmpty(), body('orderId').not().isEmpty()],
	validateRequest,
	async (req: Request, res: Response) => {
		const { paymentMethodId, orderId } = req.body;

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

		// C1: create + confirm a PaymentIntent in one step (server-side confirm).
		// allow_redirects: 'never' keeps it to card-style methods so no redirect
		// handoff is needed for this synchronous flow.
		const paymentIntent = await stripe.paymentIntents.create({
			currency: 'usd',
			amount: order.price * 100,
			payment_method: paymentMethodId,
			confirm: true,
			automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
		});

		const payment = Payment.build({
			orderId,
			stripeId: paymentIntent.id,
		});

		await payment.save();

		await new PaymentCreatedPublisher(natsWrapper.js).publish({
			id: payment.id,
			orderId: payment.orderId,
			stripeId: payment.stripeId,
		});

		res.status(201).send({ id: payment.id });
	},
);

export { router as createChargeRouter };
