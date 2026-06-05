import request from 'supertest';
import { app } from '../../app';
import mongoose from 'mongoose';
import { stripe } from '../../stripe';
import { Payment } from '../../models/payment';
import { Refund } from '../../models/refund';
import { natsWrapper } from '../../nats-wrapper';

// Build a payment_intent.succeeded event and sign it with the test webhook
// secret, exactly as Stripe would. This is pure local crypto — no network.
const signedSucceededEvent = (orderId: string, paymentIntentId: string) => {
	const payload = JSON.stringify({
		id: 'evt_test',
		object: 'event',
		type: 'payment_intent.succeeded',
		data: {
			object: {
				id: paymentIntentId,
				object: 'payment_intent',
				metadata: { orderId },
			},
		},
	});

	const signature = stripe.webhooks.generateTestHeaderString({
		payload,
		secret: process.env.STRIPE_WEBHOOK_SECRET!,
	});

	return { payload, signature };
};

// Build a signed charge.refunded event (the refund CONFIRMATION). amount in cents.
const signedRefundedEvent = (paymentIntentId: string, amountRefunded: number) => {
	const payload = JSON.stringify({
		id: 'evt_test_refund',
		object: 'event',
		type: 'charge.refunded',
		data: {
			object: {
				id: 'ch_test',
				object: 'charge',
				payment_intent: paymentIntentId,
				amount_refunded: amountRefunded,
			},
		},
	});

	const signature = stripe.webhooks.generateTestHeaderString({
		payload,
		secret: process.env.STRIPE_WEBHOOK_SECRET!,
	});

	return { payload, signature };
};

it('rejects an event with a missing/invalid signature', async () => {
	await request(app)
		.post('/api/payments/webhook')
		.set('stripe-signature', 'bogus')
		.set('Content-Type', 'application/json')
		.send(JSON.stringify({ type: 'payment_intent.succeeded' }))
		.expect(400);

	expect(natsWrapper.js.publish).not.toHaveBeenCalled();
});

it('records a Payment and publishes payment:created on payment_intent.succeeded', async () => {
	const orderId = new mongoose.Types.ObjectId().toHexString();
	const paymentIntentId = `pi_test_${orderId}`;
	const { payload, signature } = signedSucceededEvent(orderId, paymentIntentId);

	await request(app)
		.post('/api/payments/webhook')
		.set('stripe-signature', signature)
		.set('Content-Type', 'application/json')
		.send(payload)
		.expect(200);

	const payment = await Payment.findOne({ orderId });
	expect(payment).not.toEqual(null);
	expect(payment!.stripeId).toEqual(paymentIntentId);
	expect(natsWrapper.js.publish).toHaveBeenCalledTimes(1);
});

it('is idempotent — a redelivered event records the Payment only once', async () => {
	const orderId = new mongoose.Types.ObjectId().toHexString();
	const paymentIntentId = `pi_test_${orderId}`;
	const { payload, signature } = signedSucceededEvent(orderId, paymentIntentId);

	const deliver = () =>
		request(app)
			.post('/api/payments/webhook')
			.set('stripe-signature', signature)
			.set('Content-Type', 'application/json')
			.send(payload)
			.expect(200);

	await deliver();
	await deliver();

	const payments = await Payment.find({ orderId });
	expect(payments.length).toEqual(1);
	expect(natsWrapper.js.publish).toHaveBeenCalledTimes(1);
});

it('publishes payment:refunded on charge.refunded and records the refund as succeeded', async () => {
	// The refund confirms an already-recorded charge.
	const orderId = new mongoose.Types.ObjectId().toHexString();
	const paymentIntentId = `pi_test_${orderId}`;
	await Payment.build({ orderId, stripeId: paymentIntentId }).save();
	await Refund.init(); // ensure the unique orderId index exists for idempotency

	const { payload, signature } = signedRefundedEvent(paymentIntentId, 5500);

	await request(app)
		.post('/api/payments/webhook')
		.set('stripe-signature', signature)
		.set('Content-Type', 'application/json')
		.send(payload)
		.expect(200);

	const refund = await Refund.findOne({ orderId });
	expect(refund).not.toEqual(null);
	expect(refund!.status).toEqual('succeeded');
	expect(refund!.amount).toEqual(55);
	expect(natsWrapper.js.publish).toHaveBeenCalledTimes(1);
});

it('is idempotent — two charge.refunded deliveries publish payment:refunded only once', async () => {
	const orderId = new mongoose.Types.ObjectId().toHexString();
	const paymentIntentId = `pi_test_${orderId}`;
	await Payment.build({ orderId, stripeId: paymentIntentId }).save();
	await Refund.init();

	const { payload, signature } = signedRefundedEvent(paymentIntentId, 5500);
	const deliver = () =>
		request(app)
			.post('/api/payments/webhook')
			.set('stripe-signature', signature)
			.set('Content-Type', 'application/json')
			.send(payload)
			.expect(200);

	await deliver();
	await deliver(); // at-least-once redelivery must NOT publish again

	const refunds = await Refund.find({ orderId });
	expect(refunds.length).toEqual(1);
	expect(refunds[0].status).toEqual('succeeded');
	expect(natsWrapper.js.publish).toHaveBeenCalledTimes(1);
});
