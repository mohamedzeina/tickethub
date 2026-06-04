import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import { Review } from '../../models/review';

const id = () => new mongoose.Types.ObjectId().toHexString();

const seedReview = async (sellerId: string, rating: number) => {
	await Review.build({
		orderId: id(),
		sellerId,
		buyerId: id(),
		ticketTitle: 'Coldplay',
		rating,
	}).save();
};

it('is public (no auth required) and returns an empty summary for an unknown seller', async () => {
	const res = await request(app).get(`/api/reviews/seller/${id()}`).expect(200);
	expect(res.body.summary).toEqual({ average: 0, count: 0 });
	expect(res.body.reviews).toEqual([]);
});

it('aggregates the average and count for a seller', async () => {
	const sellerId = id();
	await seedReview(sellerId, 5);
	await seedReview(sellerId, 4);
	await seedReview(sellerId, 3);
	// A different seller's review must not bleed in.
	await seedReview(id(), 1);

	const res = await request(app).get(`/api/reviews/seller/${sellerId}`).expect(200);
	expect(res.body.summary.count).toEqual(3);
	expect(res.body.summary.average).toEqual(4); // (5+4+3)/3
	expect(res.body.reviews.length).toEqual(3);
});

it('exposes an opaque seller handle and buyer handles, never raw ids/emails', async () => {
	const sellerId = id();
	await seedReview(sellerId, 5);

	const res = await request(app).get(`/api/reviews/seller/${sellerId}`).expect(200);
	expect(res.body.handle).toMatch(/^Seller [0-9A-Z]{4}$/);
	expect(res.body.reviews[0].buyerHandle).toMatch(/^Buyer [0-9A-Z]{4}$/);
	// No buyer id leaked in the public payload.
	expect(JSON.stringify(res.body)).not.toContain('buyerId');
});
