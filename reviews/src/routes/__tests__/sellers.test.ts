import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import { Review } from '../../models/review';

const id = () => new mongoose.Types.ObjectId().toHexString();

const seedReview = async (
	sellerId: string,
	rating: number,
	hidden = false,
) => {
	const review = Review.build({
		orderId: id(),
		sellerId,
		buyerId: id(),
		ticketTitle: 'Coldplay',
		rating,
	});
	// `hidden` is set post-hoc on refund (Option A), not at build time.
	if (hidden) review.set('hidden', true);
	await review.save();
};

it('is public and returns [] when no ids are supplied', async () => {
	const res = await request(app).get('/api/reviews/sellers').expect(200);
	expect(res.body).toEqual([]);
});

it('aggregates rating per seller for a batch of ids', async () => {
	const a = id();
	const b = id();
	await seedReview(a, 5);
	await seedReview(a, 4); // a → avg 4.5, count 2
	await seedReview(b, 3); // b → avg 3,   count 1

	const res = await request(app)
		.get(`/api/reviews/sellers?ids=${a},${b}`)
		.expect(200);

	const byId = Object.fromEntries(res.body.map((s: any) => [s.sellerId, s.summary]));
	expect(byId[a]).toEqual({ average: 4.5, count: 2 });
	expect(byId[b]).toEqual({ average: 3, count: 1 });
});

it('omits sellers with no (visible) reviews and excludes hidden ones', async () => {
	const rated = id();
	const refundedOnly = id();
	const unknown = id();
	await seedReview(rated, 5);
	await seedReview(refundedOnly, 1, true); // only a hidden review → excluded

	const res = await request(app)
		.get(`/api/reviews/sellers?ids=${rated},${refundedOnly},${unknown}`)
		.expect(200);

	const sellerIds = res.body.map((s: any) => s.sellerId);
	expect(sellerIds).toContain(rated);
	expect(sellerIds).not.toContain(refundedOnly);
	expect(sellerIds).not.toContain(unknown);
	expect(res.body.length).toEqual(1);
});

it('does not bleed in reviews from sellers outside the requested batch', async () => {
	const wanted = id();
	const other = id();
	await seedReview(wanted, 4);
	await seedReview(other, 1);

	const res = await request(app)
		.get(`/api/reviews/sellers?ids=${wanted}`)
		.expect(200);

	expect(res.body.length).toEqual(1);
	expect(res.body[0].sellerId).toEqual(wanted);
});
