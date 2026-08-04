import express, { Request, Response } from 'express';
import {
	requireAuth,
	validateRequest,
	NotFoundError,
	NotAuthorizedError,
	BadRequestError,
} from '@zeina-tickethub/common';
import { Review } from '../models/review';
import { reviewBodyValidators, normalizeComment } from './validators';

const router = express.Router();

// Edit your own review (rating and/or comment). Authored-by-buyer only.
router.put(
	'/api/reviews/:id',
	requireAuth,
	reviewBodyValidators,
	validateRequest,
	async (req: Request, res: Response) => {
		const review = await Review.findById(req.params.id);
		if (!review) {
			throw new NotFoundError();
		}
		if (review.buyerId !== req.currentUser!.id) {
			throw new NotAuthorizedError();
		}
		// A refunded order's review is frozen (Option A) — no edits.
		if (review.hidden) {
			throw new BadRequestError('This review is no longer editable.');
		}

		review.set({
			rating: req.body.rating,
			comment: normalizeComment(req.body.comment),
		});
		await review.save();

		res.status(200).send(review);
	},
);

export { router as updateReviewRouter };
