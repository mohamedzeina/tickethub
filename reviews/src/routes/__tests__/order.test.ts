import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import { OrderRef } from '../../models/order-ref';
import { Review } from '../../models/review';
import { OrderStatus } from '@zeina-tickethub/common';

const id = () => new mongoose.Types.ObjectId().toHexString();

const seedOrder = async (buyerId: string, status = OrderStatus.Complete) => {
	const order = OrderRef.build({
		id: id(),
		buyerId,
		sellerId: id(),
		ticketId: id(),
		ticketTitle: 'Coldplay',
		status,
	});
	await order.save();
	return order;
};

it('requires auth', async () => {
	const order = await seedOrder(id());
	await request(app).get(`/api/reviews/order/${order.id}`).expect(401);
});

it('reports a reviewable order with no review yet', async () => {
	const buyerId = id();
	const order = await seedOrder(buyerId);

	const res = await request(app)
		.get(`/api/reviews/order/${order.id}`)
		.set('Cookie', global.signin(buyerId))
		.expect(200);

	expect(res.body.reviewable).toBe(true);
	expect(res.body.review).toBeNull();
	expect(res.body.sellerId).toEqual(order.sellerId);
});

it('returns the existing review once left', async () => {
	const buyerId = id();
	const order = await seedOrder(buyerId);
	await Review.build({
		orderId: order.id,
		sellerId: order.sellerId,
		buyerId,
		ticketTitle: 'Coldplay',
		rating: 5,
	}).save();

	const res = await request(app)
		.get(`/api/reviews/order/${order.id}`)
		.set('Cookie', global.signin(buyerId))
		.expect(200);

	expect(res.body.review.rating).toEqual(5);
});

it('does not let a non-buyer probe an order’s review state', async () => {
	const order = await seedOrder(id());
	await request(app)
		.get(`/api/reviews/order/${order.id}`)
		.set('Cookie', global.signin(id())) // someone else
		.expect(401);
});
