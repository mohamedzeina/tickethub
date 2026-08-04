import express, { Request, Response } from 'express';

import {
	validateRequest,
	NotFoundError,
	requireAuth,
	NotAuthorizedError,
	BadRequestError,
} from '@zeina-tickethub/common';

import { Ticket } from '../models/ticket';
import { ticketBodyValidators } from './validators';
import { rethrowVersionConflict } from './version-conflict';
import { ticketEventPayload } from '../events/ticket-event-payload';
import { TicketUpdatedPublisher } from '../events/publishers/ticket-updated-publisher';
import { natsWrapper } from '../nats-wrapper';

const router = express.Router();

router.put(
	'/api/tickets/:id',
	requireAuth,
	[...ticketBodyValidators],
	validateRequest,
	async (req: Request, res: Response) => {
		const ticket = await Ticket.findById(req.params.id);

		if (!ticket) {
			throw new NotFoundError();
		}

		// Ownership first (as in unlist.ts) — checking reservations before it told a
		// stranger whether someone else's listing was reserved.
		if (ticket.userId !== req.currentUser!.id) {
			throw new NotAuthorizedError();
		}

		// Block edits once any seat has been reserved or sold (availableQty has
		// dropped below the listed quantity) — the same protection the single-unit
		// orderId check gave, generalised to multi-seat.
		if (ticket.availableQty < ticket.quantity) {
			throw new BadRequestError('Cannot edit a ticket with active reservations');
		}

		// Quantity is only editable while fully available (guaranteed above), so the
		// new quantity is also fully available.
		const seats = req.body.quantity ?? ticket.quantity;

		ticket.set({
			title: req.body.title,
			price: req.body.price,
			quantity: seats,
			availableQty: seats,
			eventDate: req.body.eventDate,
			venue: req.body.venue,
			description: req.body.description,
			category: req.body.category || 'Other',
			imageUrl: req.body.imageUrl,
		});

		try {
			await ticket.save();
		} catch (err) {
			await rethrowVersionConflict(err, req.params.id, 'edited');
		}

		new TicketUpdatedPublisher(natsWrapper.js).publish(
			ticketEventPayload(ticket),
		);

		res.send(ticket);
	},
);

export { router as updateTicketRouter };
