import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import { requireAuth, validateRequest } from '@zeina-tickethub/common';
import { Ticket, TICKET_CATEGORIES } from '../models/ticket';
import { TicketCreatedPublisher } from '../events/publishers/ticket-created-publisher';
import { natsWrapper } from '../nats-wrapper';

const router = express.Router();

router.post(
	'/api/tickets',
	requireAuth,
	[
		body('title').not().isEmpty().withMessage('Title is required'),
		body('price')
			.isFloat({
				gt: 0,
			})
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
		const { title, price, eventDate, venue, description, category, imageUrl } =
			req.body;

		const ticket = Ticket.build({
			title,
			price,
			userId: req.currentUser!.id,
			eventDate,
			venue,
			description,
			category: category || 'Other',
			imageUrl,
		});

		await ticket.save();

		await new TicketCreatedPublisher(natsWrapper.client).publish({
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

		res.status(201).send(ticket);
	},
);

export { router as createTicketRouter };
