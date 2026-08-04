import express, { Request, Response } from 'express';
import { Review } from '../models/review';
import { sellerHandle, buyerHandle } from '../services/handle';
import { sellerSummaries } from '../services/seller-summary';

const router = express.Router();

// Public seller reputation: aggregate rating + the most recent reviews. No auth
// — this is what a prospective buyer sees. Buyers are shown as opaque handles.
router.get(
	'/api/reviews/seller/:sellerId',
	async (req: Request, res: Response) => {
		const { sellerId } = req.params;

		// Exclude soft-hidden reviews (refunded orders, Option A) — reputation
		// reflects only real, kept purchases.
		//
		// The `limit` caps the reviews we RENDER, not the ones we count: the
		// summary comes from an aggregate over every visible review, so a seller
		// past 50 reviews no longer reports a truncated count here while their
		// listing badges report the real one.
		const reviews = await Review.find({ sellerId, hidden: { $ne: true } })
			.sort({ createdAt: -1 })
			.limit(50);

		const [aggregate] = await sellerSummaries([sellerId]);
		const summary = aggregate
			? { average: aggregate.average, count: aggregate.count }
			: { average: 0, count: 0 };

		res.status(200).send({
			sellerId,
			handle: sellerHandle(sellerId),
			summary,
			reviews: reviews.map((r) => ({
				id: r.id,
				rating: r.rating,
				comment: r.comment,
				ticketTitle: r.ticketTitle,
				buyerHandle: buyerHandle(r.buyerId),
				createdAt: r.createdAt,
			})),
		});
	},
);

export { router as sellerReviewsRouter };
