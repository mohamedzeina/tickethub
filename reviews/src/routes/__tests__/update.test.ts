import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import { Review } from '../../models/review';

const buildReview = async (buyerId: string, hidden = false) => {
	const review = Review.build({
		orderId: new mongoose.Types.ObjectId().toHexString(),
		sellerId: new mongoose.Types.ObjectId().toHexString(),
		buyerId,
		ticketTitle: 'Akon Concert',
		rating: 4,
	});
	if (hidden) review.set({ hidden: true });
	await review.save();
	return review;
};

it('lets the author edit their own review', async () => {
	const buyerId = new mongoose.Types.ObjectId().toHexString();
	const review = await buildReview(buyerId);

	const res = await request(app)
		.put(`/api/reviews/${review.id}`)
		.set('Cookie', global.signin(buyerId))
		.send({ rating: 2, comment: 'changed my mind' })
		.expect(200);

	expect(res.body.rating).toEqual(2);
});

it("401s when editing someone else's review", async () => {
	const review = await buildReview(new mongoose.Types.ObjectId().toHexString());
	await request(app)
		.put(`/api/reviews/${review.id}`)
		.set('Cookie', global.signin())
		.send({ rating: 1 })
		.expect(401);
});

it('400s when editing a hidden (refunded) review', async () => {
	const buyerId = new mongoose.Types.ObjectId().toHexString();
	const review = await buildReview(buyerId, true);
	await request(app)
		.put(`/api/reviews/${review.id}`)
		.set('Cookie', global.signin(buyerId))
		.send({ rating: 1 })
		.expect(400);
});
