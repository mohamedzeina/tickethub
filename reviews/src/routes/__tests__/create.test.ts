import request from 'supertest';
import { app } from '../../app';
import { Review } from '../../models/review';
import { OrderStatus } from '@zeina-tickethub/common';
import { id, seedOrder } from '../../test/factories';

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

it('answers a duplicate race with the same 400, never a 500', async () => {
	// Two concurrent submits both clear the findOne pre-check, so the unique
	// index is what separates them. Build it up front so the collision is
	// deterministic rather than dependent on background index creation.
	await Review.init();

	const buyerId = id();
	const order = await seedOrder({ buyerId });
	const cookie = global.signin(buyerId);

	const submit = () =>
		request(app)
			.post('/api/reviews')
			.set('Cookie', cookie)
			.send({ orderId: order.id, rating: 5 });

	const results = await Promise.all([submit(), submit()]);

	expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
	// The loser sees the friendly message, not a raw E11000.
	const loser = results.find((r) => r.status === 400)!;
	expect(loser.body.errors[0].message).toEqual(
		'You have already reviewed this order.',
	);

	expect(await Review.countDocuments({})).toEqual(1);
});
