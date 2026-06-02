import request from 'supertest';
import { app } from '../../app';
import mongoose from 'mongoose';
import { Order } from '../../models/order';
import { OrderStatus } from '@zeina-tickethub/common';
import { stripe } from '../../stripe';
import { Payment } from '../../models/payment';

it('throws a 404 error when purchasing an order that does not exist', async () => {
	await request(app)
		.post('/api/payments')
		.set('Cookie', global.signin())
		.send({
			paymentMethodId: 'pm_card_visa',
			orderId: new mongoose.Types.ObjectId().toHexString(),
		})
		.expect(404);
});

it('throws a 401 error when purchasing an order that does not belong to the user', async () => {
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
			paymentMethodId: 'pm_card_visa',
			orderId: order.id,
		})
		.expect(401);
});

it('throws a 400 error when purchasing a cancelled order', async () => {
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
			paymentMethodId: 'pm_card_visa',
			orderId: order.id,
		})
		.expect(400);
});

it('returns a 201 with valid inputs', async () => {
	const userId = new mongoose.Types.ObjectId().toHexString();
	const price = Math.floor(Math.random() * 100000);
	const user = global.signin(userId);

	const order = Order.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		status: OrderStatus.Created,
		version: 0,
		userId,
		price,
	});

	await order.save();

	await request(app)
		.post('/api/payments')
		.set('Cookie', user)
		.send({
			paymentMethodId: 'pm_card_visa',
			orderId: order.id,
		})
		.expect(201);

	const payment = await Payment.findOne({ orderId: order.id });
	expect(payment).not.toEqual(null);

	const paymentIntent = await stripe.paymentIntents.retrieve(payment!.stripeId);
	expect(paymentIntent.amount).toEqual(price * 100);
	expect(paymentIntent.currency).toEqual('usd');
	expect(paymentIntent.status).toEqual('succeeded');
});
