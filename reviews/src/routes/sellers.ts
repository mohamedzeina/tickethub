import express, { Request, Response } from 'express';
import { sellerSummaries } from '../services/seller-summary';

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

	// Same aggregate the seller profile uses, so the badge and the profile always
	// report the same numbers.
	const summaries = await sellerSummaries(ids);

	res.send(
		summaries.map((s) => ({
			sellerId: s.sellerId,
			summary: { average: s.average, count: s.count },
		})),
	);
});

export { router as sellersReviewsRouter };
