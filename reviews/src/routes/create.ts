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
import { reviewBodyValidators, normalizeComment } from './validators';
import { isDuplicateKey } from '../is-duplicate-key';

const router = express.Router();

// One message for both duplicate paths — the friendly pre-check and the index
// collision behind it — so a race looks identical to a plain second submit.
const ALREADY_REVIEWED = 'You have already reviewed this order.';

// Create a review for a completed order. Gated three ways: the order must exist
// and belong to the requester (the buyer), it must be Complete, and it must not
// already have a review. The seller is taken from the order replica, never the
// client — a buyer can't aim a review at an arbitrary seller.
router.post(
	'/api/reviews',
	requireAuth,
	[
		body('orderId').notEmpty().withMessage('orderId is required'),
		...reviewBodyValidators,
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
			throw new BadRequestError(ALREADY_REVIEWED);
		}

		const review = Review.build({
			orderId,
			sellerId: order.sellerId,
			buyerId: order.buyerId,
			ticketTitle: order.ticketTitle,
			rating,
			comment: normalizeComment(comment),
		});
		// The pre-check above is only advisory: two concurrent submits can both
		// clear it, and the loser collides with the unique index here. Answer it
		// with the same 400 rather than letting a raw E11000 surface as a 500.
		try {
			await review.save();
		} catch (err) {
			if (isDuplicateKey(err)) {
				throw new BadRequestError(ALREADY_REVIEWED);
			}
			throw err;
		}

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
