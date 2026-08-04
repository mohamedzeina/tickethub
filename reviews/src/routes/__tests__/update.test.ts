import request from 'supertest';
import { app } from '../../app';
import { id, seedReview } from '../../test/factories';

const buildReview = (buyerId: string, hidden = false) =>
	seedReview({ buyerId, ticketTitle: 'Akon Concert', rating: 4, hidden });

it('lets the author edit their own review', async () => {
	const buyerId = id();
	const review = await buildReview(buyerId);

	const res = await request(app)
		.put(`/api/reviews/${review.id}`)
		.set('Cookie', global.signin(buyerId))
		.send({ rating: 2, comment: 'changed my mind' })
		.expect(200);

	expect(res.body.rating).toEqual(2);
});

it("401s when editing someone else's review", async () => {
	const review = await buildReview(id());
	await request(app)
		.put(`/api/reviews/${review.id}`)
		.set('Cookie', global.signin())
		.send({ rating: 1 })
		.expect(401);
});

it('400s when editing a hidden (refunded) review', async () => {
	const buyerId = id();
	const review = await buildReview(buyerId, true);
	await request(app)
		.put(`/api/reviews/${review.id}`)
		.set('Cookie', global.signin(buyerId))
		.send({ rating: 1 })
		.expect(400);
});
