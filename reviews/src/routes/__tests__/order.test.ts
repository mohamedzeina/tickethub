import request from 'supertest';
import { app } from '../../app';
import { id, seedOrder, seedReview } from '../../test/factories';

it('requires auth', async () => {
	const order = await seedOrder({ buyerId: id() });
	await request(app).get(`/api/reviews/order/${order.id}`).expect(401);
});

it('reports a reviewable order with no review yet', async () => {
	const buyerId = id();
	const order = await seedOrder({ buyerId });

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
	const order = await seedOrder({ buyerId });
	await seedReview({
		orderId: order.id,
		sellerId: order.sellerId,
		buyerId,
		ticketTitle: 'Coldplay',
		rating: 5,
	});

	const res = await request(app)
		.get(`/api/reviews/order/${order.id}`)
		.set('Cookie', global.signin(buyerId))
		.expect(200);

	expect(res.body.review.rating).toEqual(5);
});

it('does not let a non-buyer probe an order’s review state', async () => {
	const order = await seedOrder({ buyerId: id() });
	await request(app)
		.get(`/api/reviews/order/${order.id}`)
		.set('Cookie', global.signin(id())) // someone else
		.expect(401);
});
