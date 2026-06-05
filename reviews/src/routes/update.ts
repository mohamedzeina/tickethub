import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import {
	requireAuth,
	validateRequest,
	NotFoundError,
	NotAuthorizedError,
	BadRequestError,
} from '@zeina-tickethub/common';
import { Review } from '../models/review';

const router = express.Router();

// Edit your own review (rating and/or comment). Authored-by-buyer only.
router.put(
	'/api/reviews/:id',
	requireAuth,
	[
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
			comment: req.body.comment?.trim() || undefined,
		});
		await review.save();

		res.status(200).send(review);
	},
);

export { router as updateReviewRouter };
