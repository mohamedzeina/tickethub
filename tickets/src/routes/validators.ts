import { body } from 'express-validator';
import { TICKET_CATEGORIES } from '../models/ticket';

// Cap on seats a single listing may offer. Per-service on purpose: orders keeps
// its own copy of the same number — sharing it would mean putting it in the
// common package.
export const MAX_SEATS_PER_ORDER = 20;

// The listing body rules shared by create (POST /api/tickets) and edit
// (PUT /api/tickets/:id) — both accept the same seller-supplied fields, so the
// chain lives here instead of being kept byte-identical in two routes.
export const ticketBodyValidators = [
	body('title').not().isEmpty().withMessage('Title is required'),
	body('price')
		.isFloat({ gt: 0 })
		.withMessage('Price must be greater than 0'),
	body('quantity')
		.optional()
		.isInt({ min: 1, max: MAX_SEATS_PER_ORDER })
		.withMessage(
			`Quantity must be a whole number between 1 and ${MAX_SEATS_PER_ORDER}`,
		)
		.toInt(),
	body('eventDate')
		.isISO8601()
		.withMessage('A valid event date is required')
		.custom((value) => {
			const eventDate = new Date(value);
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			if (eventDate < today) {
				throw new Error('Event date cannot be in the past');
			}
			return true;
		})
		.toDate(),
	body('venue').trim().not().isEmpty().withMessage('Venue is required'),
	body('description').optional({ checkFalsy: true }).trim(),
	body('category')
		.optional({ checkFalsy: true })
		.isIn(TICKET_CATEGORIES)
		.withMessage('Invalid category'),
	body('imageUrl')
		.optional({ checkFalsy: true })
		.isURL()
		.withMessage('Image must be a valid URL'),
];
