import { body } from 'express-validator';

// The rating/comment rules are identical on create and update — one copy so the
// two routes can never drift apart. The messages are asserted by tests and by
// the client, so treat them as part of the API.
export const reviewBodyValidators = [
	body('rating')
		.isInt({ min: 1, max: 5 })
		.withMessage('rating must be an integer from 1 to 5'),
	body('comment')
		.optional()
		.isString()
		.isLength({ max: 1000 })
		.withMessage('comment must be 1000 characters or fewer'),
];

// A whitespace-only comment is the same as no comment at all — store it as
// undefined rather than an empty string.
export const normalizeComment = (comment?: string) =>
	comment?.trim() || undefined;
