import express, { Request, Response } from 'express';
import {
	requireAuth,
	requireVerified,
	validateRequest,
} from '@zeina-tickethub/common';
import { Ticket } from '../models/ticket';
import { ticketBodyValidators } from './validators';
import { ticketEventPayload } from '../events/ticket-event-payload';
import { TicketCreatedPublisher } from '../events/publishers/ticket-created-publisher';
import { natsWrapper } from '../nats-wrapper';

const router = express.Router();

router.post(
	'/api/tickets',
	requireAuth,
	requireVerified,
	[...ticketBodyValidators],
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

		await new TicketCreatedPublisher(natsWrapper.js).publish(
			ticketEventPayload(ticket),
		);

		res.status(201).send(ticket);
	},
);

export { router as createTicketRouter };
