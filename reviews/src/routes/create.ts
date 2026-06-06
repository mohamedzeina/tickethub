import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import {
	requireAuth,
	validateRequest,
	BadRequestError,
	NotFoundError,
	NotAuthorizedError,
	OrderStatus,
	logger,
} from '@zeina-tickethub/common';
import { OrderRef } from '../models/order-ref';
import { Review } from '../models/review';
import { ReviewCreatedPublisher } from '../events/publishers/review-created-publisher';
import { natsWrapper } from '../nats-wrapper';

const router = express.Router();

// Create a review for a completed order. Gated three ways: the order must exist
// and belong to the requester (the buyer), it must be Complete, and it must not
// already have a review. The seller is taken from the order replica, never the
// client — a buyer can't aim a review at an arbitrary seller.
router.post(
	'/api/reviews',
	requireAuth,
	[
		body('orderId').notEmpty().withMessage('orderId is required'),
		body('rating')
			.isInt({ min: 1, max: 5 })
			.withMessage('rating must be an integer from 1 to 5'),
		body('comment')
			.optional()
			.isString()
			.isLength({ max: 1000 })
			.withMessage('comment must be 1000 characters or fewer'),
	],
	validateRequest,
	async (req: Request, res: Response) => {
		const { orderId, rating, comment } = req.body;

		const order = await OrderRef.findById(orderId);
		if (!order) {
			throw new NotFoundError();
		}
		if (order.buyerId !== req.currentUser!.id) {
			throw new NotAuthorizedError();
		}
		if (order.status !== OrderStatus.Complete) {
			throw new BadRequestError('You can only review a completed order.');
		}

		const existing = await Review.findOne({ orderId });
		if (existing) {
			throw new BadRequestError('You have already reviewed this order.');
		}

		const review = Review.build({
			orderId,
			sellerId: order.sellerId,
			buyerId: order.buyerId,
			ticketTitle: order.ticketTitle,
			rating,
			comment: comment?.trim() || undefined,
		});
		await review.save();

		// Tell notifications so the seller hears about it (#9, previously parked).
		// Best-effort: the review is already saved, so a publish hiccup must not
		// fail the request — the seller just misses this one alert.
		try {
			await new ReviewCreatedPublisher(natsWrapper.js).publish({
				reviewId: review.id,
				sellerId: review.sellerId,
				buyerId: review.buyerId,
				ticketTitle: review.ticketTitle,
				rating: review.rating,
			});
		} catch (err) {
			logger.error({ err, reviewId: review.id }, 'failed to publish review:created');
		}

		res.status(201).send(review);
	},
);

export { router as createReviewRouter };
