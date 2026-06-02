import request from 'supertest';
import { app } from '../../app';
import mongoose from 'mongoose';
import { Order } from '../../models/order';
import { OrderStatus } from '@zeina-tickethub/common';
import { stripe } from '../../stripe';
import { Payment } from '../../models/payment';

it('throws a 404 error when paying for an order that does not exist', async () => {
	await request(app)
		.post('/api/payments')
		.set('Cookie', global.signin())
		.send({
			orderId: new mongoose.Types.ObjectId().toHexString(),
		})
		.expect(404);
});

it('throws a 401 error when paying for an order that does not belong to the user', async () => {
	const order = Order.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		status: OrderStatus.Created,
		version: 0,
		userId: new mongoose.Types.ObjectId().toHexString(),
		price: 20,
	});

	await order.save();

	await request(app)
		.post('/api/payments')
		.set('Cookie', global.signin())
		.send({
			orderId: order.id,
		})
		.expect(401);
});

it('throws a 400 error when paying for a cancelled order', async () => {
	const userId = new mongoose.Types.ObjectId().toHexString();
	const user = global.signin(userId);

	const order = Order.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		status: OrderStatus.Cancelled,
		version: 1,
		userId,
		price: 20,
	});

	await order.save();

	await request(app)
		.post('/api/payments')
		.set('Cookie', user)
		.send({
			orderId: order.id,
		})
		.expect(400);
});

it('creates a PaymentIntent and returns its client_secret, but records no Payment yet', async () => {
	const userId = new mongoose.Types.ObjectId().toHexString();
	const price = Math.floor(Math.random() * 100000) + 1;
	const user = global.signin(userId);

	const order = Order.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		status: OrderStatus.Created,
		version: 0,
		userId,
		price,
	});

	await order.save();

	const response = await request(app)
		.post('/api/payments')
		.set('Cookie', user)
		.send({ orderId: order.id })
		.expect(201);

	expect(response.body.clientSecret).toBeDefined();

	// The client_secret is `${paymentIntentId}_secret_...` — recover the intent
	// id from it and confirm Stripe created it for the right amount.
	const paymentIntentId = response.body.clientSecret.split('_secret_')[0];
	const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
	expect(paymentIntent.amount).toEqual(price * 100);
	expect(paymentIntent.currency).toEqual('usd');
	expect(paymentIntent.metadata.orderId).toEqual(order.id);

	// The Payment is recorded by the webhook on payment_intent.succeeded, not here.
	const payment = await Payment.findOne({ orderId: order.id });
	expect(payment).toEqual(null);
});
