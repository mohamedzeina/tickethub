import express, { Request, Response } from 'express';
import { Review } from '../models/review';
import { sellerHandle, buyerHandle } from '../services/handle';

const router = express.Router();

// Public seller reputation: aggregate rating + the most recent reviews. No auth
// — this is what a prospective buyer sees. Buyers are shown as opaque handles.
router.get(
	'/api/reviews/seller/:sellerId',
	async (req: Request, res: Response) => {
		const { sellerId } = req.params;

		const reviews = await Review.find({ sellerId })
			.sort({ createdAt: -1 })
			.limit(50);

		const count = reviews.length;
		const average =
			count === 0
				? 0
				: Math.round(
						(reviews.reduce((sum, r) => sum + r.rating, 0) / count) * 10,
				  ) / 10;

		res.status(200).send({
			sellerId,
			handle: sellerHandle(sellerId),
			summary: { average, count },
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
