import express, { Request, Response } from 'express';
import { Review } from '../models/review';

const router = express.Router();

// GET /api/reviews/sellers?ids=a,b,c — batch aggregate rating for many sellers in
// one round trip (#9 per-card ratings). Lets the browse/search grid show a star
// badge per listing without an N+1 of /seller/:id calls. Public; cap 50; degrades
// (ignores junk ids, omits unknown/zero-review sellers) rather than 400s. Distinct
// path from /api/reviews/seller/:sellerId so neither shadows the other.
router.get('/api/reviews/sellers', async (req: Request, res: Response) => {
	const raw = typeof req.query.ids === 'string' ? req.query.ids : '';
	const ids = raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.slice(0, 50);

	if (!ids.length) {
		return res.send([]);
	}

	// Exclude soft-hidden reviews (refunded orders, Option A) so the badge matches
	// the seller-profile aggregate. Group by seller in a single query.
	const groups = await Review.aggregate([
		{ $match: { sellerId: { $in: ids }, hidden: { $ne: true } } },
		{
			$group: {
				_id: '$sellerId',
				sum: { $sum: '$rating' },
				count: { $sum: 1 },
			},
		},
	]);

	res.send(
		groups.map((g) => ({
			sellerId: g._id,
			summary: {
				average: Math.round((g.sum / g.count) * 10) / 10,
				count: g.count,
			},
		})),
	);
});

export { router as sellersReviewsRouter };
