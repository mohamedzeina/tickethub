import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import { OrderRef } from '../../models/order-ref';
import { Review } from '../../models/review';
import { OrderStatus } from '@zeina-tickethub/common';

const id = () => new mongoose.Types.ObjectId().toHexString();

// Seed a local order replica the way the listeners would, so the route has
// something to authorize against.
const seedOrder = async (overrides: any = {}) => {
	const order = OrderRef.build({
		id: overrides.id || id(),
		buyerId: overrides.buyerId || id(),
		sellerId: overrides.sellerId || id(),
		ticketId: overrides.ticketId || id(),
		ticketTitle: overrides.ticketTitle || 'Coldplay',
		status: overrides.status || OrderStatus.Complete,
	});
	await order.save();
	return order;
};

it('requires authentication', async () => {
	const order = await seedOrder();
	await request(app)
		.post('/api/reviews')
		.send({ orderId: order.id, rating: 5 })
		.expect(401);
});

it('returns 404 for an unknown order', async () => {
	await request(app)
		.post('/api/reviews')
		.set('Cookie', global.signin())
		.send({ orderId: id(), rating: 5 })
		.expect(404);
});

it('forbids reviewing an order you did not buy', async () => {
	const order = await seedOrder({ buyerId: id() });
	await request(app)
		.post('/api/reviews')
		.set('Cookie', global.signin(id())) // a different user
		.send({ orderId: order.id, rating: 5 })
		.expect(401);
});

it('forbids reviewing an order that is not complete', async () => {
	const buyerId = id();
	const order = await seedOrder({ buyerId, status: OrderStatus.Created });
	await request(app)
		.post('/api/reviews')
		.set('Cookie', global.signin(buyerId))
		.send({ orderId: order.id, rating: 5 })
		.expect(400);
});

it('rejects an out-of-range rating', async () => {
	const buyerId = id();
	const order = await seedOrder({ buyerId });
	await request(app)
		.post('/api/reviews')
		.set('Cookie', global.signin(buyerId))
		.send({ orderId: order.id, rating: 6 })
		.expect(400);
});

it('lets the buyer review a completed order, targeting the order’s seller', async () => {
	const buyerId = id();
	const sellerId = id();
	const order = await seedOrder({ buyerId, sellerId, ticketTitle: 'Hamilton' });

	const res = await request(app)
		.post('/api/reviews')
		.set('Cookie', global.signin(buyerId))
		.send({ orderId: order.id, rating: 4, comment: 'Smooth handoff' })
		.expect(201);

	expect(res.body.sellerId).toEqual(sellerId);
	expect(res.body.buyerId).toEqual(buyerId);
	expect(res.body.rating).toEqual(4);
	expect(res.body.ticketTitle).toEqual('Hamilton');

	const stored = await Review.find({});
	expect(stored.length).toEqual(1);
});

it('allows only one review per order', async () => {
	const buyerId = id();
	const order = await seedOrder({ buyerId });
	const cookie = global.signin(buyerId);

	await request(app)
		.post('/api/reviews')
		.set('Cookie', cookie)
		.send({ orderId: order.id, rating: 5 })
		.expect(201);

	await request(app)
		.post('/api/reviews')
		.set('Cookie', cookie)
		.send({ orderId: order.id, rating: 3 })
		.expect(400);
});
