import request from 'supertest';
import { app } from '../../app';
import mongoose from 'mongoose';
import { Order } from '../../models/order';
import { OrderStatus } from '@zeina-tickethub/common';

it('throws a 404 error when purchasing an order that does not exist', async () => {
	await request(app)
		.post('/api/payments')
		.set('Cookie', global.signin())
		.send({
			token: 'asfafa',
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
			token: 'asfafa',
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
			token: 'asfafa',
			orderId: order.id,
		})
		.expect(400);
});
