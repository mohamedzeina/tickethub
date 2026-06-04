import express, { Request, Response } from 'express';
import { requireAuth, NotAuthorizedError } from '@zeina-tickethub/common';
import { OrderRef } from '../models/order-ref';
import { Review } from '../models/review';

const router = express.Router();

// Does the current buyer have a review for this order yet, and is the order
// reviewable? Drives the receipt UI ("Leave a review" vs. show the existing
// one). Scoped to the order's buyer.
router.get(
	'/api/reviews/order/:orderId',
	requireAuth,
	async (req: Request, res: Response) => {
		const { orderId } = req.params;

		const order = await OrderRef.findById(orderId);
		// Only the buyer may probe their own order's review state. Treat unknown
		// orders the same as a non-owner to avoid leaking existence.
		if (!order || order.buyerId !== req.currentUser!.id) {
			throw new NotAuthorizedError();
		}

		const review = await Review.findOne({ orderId });

		res.status(200).send({
			reviewable: order.status === 'complete',
			sellerId: order.sellerId,
			review: review || null,
		});
	},
);

export { router as orderReviewRouter };
