import request from 'supertest';
import { app } from '../../app';
import { id, seedReview } from '../../test/factories';

it('is public (no auth required) and returns an empty summary for an unknown seller', async () => {
	const res = await request(app).get(`/api/reviews/seller/${id()}`).expect(200);
	expect(res.body.summary).toEqual({ average: 0, count: 0 });
	expect(res.body.reviews).toEqual([]);
});

it('aggregates the average and count for a seller', async () => {
	const sellerId = id();
	await seedReview({ sellerId, rating: 5 });
	await seedReview({ sellerId, rating: 4 });
	await seedReview({ sellerId, rating: 3 });
	// A different seller's review must not bleed in.
	await seedReview({ sellerId: id(), rating: 1 });

	const res = await request(app).get(`/api/reviews/seller/${sellerId}`).expect(200);
	expect(res.body.summary.count).toEqual(3);
	expect(res.body.summary.average).toEqual(4); // (5+4+3)/3
	expect(res.body.reviews.length).toEqual(3);
});

it('counts every visible review, not just the page it renders', async () => {
	const sellerId = id();
	// 60 reviews, all rating 4 — past the 50 the route renders.
	for (let i = 0; i < 60; i++) {
		await seedReview({ sellerId, rating: 4 });
	}

	const res = await request(app).get(`/api/reviews/seller/${sellerId}`).expect(200);
	// The summary used to be derived from the .limit(50) result set, so it
	// reported 50 here while the batch badge endpoint reported 60.
	expect(res.body.summary.count).toEqual(60);
	expect(res.body.summary.average).toEqual(4);
	// The rendered list is still capped.
	expect(res.body.reviews.length).toEqual(50);

	// And the badge endpoint agrees, which is the whole point.
	const badge = await request(app)
		.get(`/api/reviews/sellers?ids=${sellerId}`)
		.expect(200);
	expect(badge.body[0].summary).toEqual(res.body.summary);
});

it('exposes an opaque seller handle and buyer handles, never raw ids/emails', async () => {
	const sellerId = id();
	await seedReview({ sellerId, rating: 5 });

	const res = await request(app).get(`/api/reviews/seller/${sellerId}`).expect(200);
	expect(res.body.handle).toMatch(/^Seller [0-9A-Z]{4}$/);
	expect(res.body.reviews[0].buyerHandle).toMatch(/^Buyer [0-9A-Z]{4}$/);
	// No buyer id leaked in the public payload.
	expect(JSON.stringify(res.body)).not.toContain('buyerId');
});
