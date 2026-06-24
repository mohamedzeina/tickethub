import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import {
	requireAuth,
	requireVerified,
	validateRequest,
} from '@zeina-tickethub/common';
import { Ticket, TICKET_CATEGORIES } from '../models/ticket';
import { TicketCreatedPublisher } from '../events/publishers/ticket-created-publisher';
import { natsWrapper } from '../nats-wrapper';

const router = express.Router();

router.post(
	'/api/tickets',
	requireAuth,
	requireVerified,
	[
		body('title').not().isEmpty().withMessage('Title is required'),
		body('price')
			.isFloat({
				gt: 0,
			})
			.withMessage('Price must be greater than 0'),
		body('quantity')
			.optional()
			.isInt({ min: 1, max: 20 })
			.withMessage('Quantity must be a whole number between 1 and 20')
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
	],
	validateRequest,
	async (req: Request, res: Response) => {
		const {
			title,
			price,
			quantity,
			eventDate,
			venue,
			description,
			category,
			imageUrl,
		} = req.body;

		// A new listing is fully available: every seat is on sale.
		const seats = quantity ?? 1;

		const ticket = Ticket.build({
			title,
			price,
			quantity: seats,
			availableQty: seats,
			userId: req.currentUser!.id,
			eventDate,
			venue,
			description,
			category: category || 'Other',
			imageUrl,
		});

		await ticket.save();

		await new TicketCreatedPublisher(natsWrapper.js).publish({
			id: ticket.id,
			version: ticket.version,
			title: ticket.title,
			price: ticket.price,
			quantity: ticket.quantity,
			availableQty: ticket.availableQty,
			userId: ticket.userId,
			eventDate: ticket.eventDate?.toISOString(),
			venue: ticket.venue,
			description: ticket.description,
			category: ticket.category,
			imageUrl: ticket.imageUrl,
		});

		res.status(201).send(ticket);
	},
);

export { router as createTicketRouter };
