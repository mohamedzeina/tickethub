import express, { Request, Response } from 'express';
import { body } from 'express-validator';

import {
	validateRequest,
	NotFoundError,
	requireAuth,
	NotAuthorizedError,
	BadRequestError,
} from '@zeina-tickethub/common';

import { Ticket, TICKET_CATEGORIES } from '../models/ticket';
import { TicketUpdatedPublisher } from '../events/publishers/ticket-updated-publisher';
import { natsWrapper } from '../nats-wrapper';

const router = express.Router();

router.put(
	'/api/tickets/:id',
	requireAuth,
	[
		body('title').not().isEmpty().withMessage('Title is required'),
		body('price')
			.isFloat({ gt: 0 })
			.withMessage('Price must be greater than 0'),
		body('eventDate')
			.isISO8601()
			.withMessage('A valid event date is required')
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
		const ticket = await Ticket.findById(req.params.id);

		if (!ticket) {
			throw new NotFoundError();
		}

		if (ticket.orderId) {
			throw new BadRequestError('Cannot edit a reserved ticket');
		}

		if (ticket.userId !== req.currentUser!.id) {
			throw new NotAuthorizedError();
		}

		ticket.set({
			title: req.body.title,
			price: req.body.price,
			eventDate: req.body.eventDate,
			venue: req.body.venue,
			description: req.body.description,
			category: req.body.category || 'Other',
			imageUrl: req.body.imageUrl,
		});

		await ticket.save();

		new TicketUpdatedPublisher(natsWrapper.client).publish({
			id: ticket.id,
			version: ticket.version,
			title: ticket.title,
			price: ticket.price,
			userId: ticket.userId,
			eventDate: ticket.eventDate?.toISOString(),
			venue: ticket.venue,
			description: ticket.description,
			category: ticket.category,
			imageUrl: ticket.imageUrl,
		});

		res.send(ticket);
	},
);

export { router as updateTicketRouter };
