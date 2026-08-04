import express, { Request, Response } from 'express';
import {
	requireAuth,
	NotFoundError,
	NotAuthorizedError,
	BadRequestError,
} from '@zeina-tickethub/common';
import { Ticket, TicketDoc } from '../models/ticket';
import { rethrowVersionConflict } from './version-conflict';
import { ticketEventPayload } from '../events/ticket-event-payload';
import { TicketUpdatedPublisher } from '../events/publishers/ticket-updated-publisher';
import { natsWrapper } from '../nats-wrapper';

const router = express.Router();

// Publish the ticket:updated event after toggling the flag so the orders service
// learns the listing changed. Reuses the standard save() flow so the version is
// bumped in lockstep with consumers (a flag-only updateOne would skew them).
const publishUpdate = (ticket: TicketDoc) =>
	new TicketUpdatedPublisher(natsWrapper.js).publish(ticketEventPayload(ticket));

const setListed = (listed: boolean) => async (req: Request, res: Response) => {
	const ticket = await Ticket.findById(req.params.id);

	if (!ticket) {
		throw new NotFoundError();
	}
	if (ticket.userId !== req.currentUser!.id) {
		throw new NotAuthorizedError();
	}
	// Don't unlist a ticket that's mid-sale; relisting a reserved ticket is a
	// no-op the buyer shouldn't be able to undo either. With multi-seat, "mid-sale"
	// means any seat has been reserved (availableQty below the listed quantity).
	if (ticket.availableQty < ticket.quantity) {
		throw new BadRequestError('Cannot change a ticket with active reservations');
	}

	ticket.set({ unlisted: !listed });

	try {
		await ticket.save();
	} catch (err) {
		await rethrowVersionConflict(
			err,
			req.params.id,
			listed ? 'relisted' : 'unlisted',
		);
	}

	await publishUpdate(ticket);

	res.send(ticket);
};

// Soft-delete (unlist) and relist a listing.
router.delete('/api/tickets/:id', requireAuth, setListed(false));
router.post('/api/tickets/:id/relist', requireAuth, setListed(true));

export { router as unlistTicketRouter };
