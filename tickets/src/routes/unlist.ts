import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
	requireAuth,
	NotFoundError,
	NotAuthorizedError,
	BadRequestError,
} from '@zeina-tickethub/common';
import { Ticket } from '../models/ticket';
import { TicketUpdatedPublisher } from '../events/publishers/ticket-updated-publisher';
import { natsWrapper } from '../nats-wrapper';

const router = express.Router();

// Publish the ticket:updated event after toggling the flag so the orders service
// learns the listing changed. Reuses the standard save() flow so the version is
// bumped in lockstep with consumers (a flag-only updateOne would skew them).
const publishUpdate = (ticket: any) =>
	new TicketUpdatedPublisher(natsWrapper.js).publish({
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
		unlisted: ticket.unlisted,
	});

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
		// A concurrent change — most likely a buyer reserving this ticket in the
		// same instant — bumps the version, so optimistic concurrency rejects this
		// save. Surface a clean 400 instead of an unhandled version error.
		if (err instanceof mongoose.Error.VersionError) {
			const latest = await Ticket.findById(req.params.id);
			if (latest && latest.availableQty < latest.quantity) {
				throw new BadRequestError(
					`This ticket was just reserved and can no longer be ${
						listed ? 'relisted' : 'unlisted'
					}`,
				);
			}
			throw new BadRequestError(
				'This ticket was just updated — reload and try again',
			);
		}
		throw err;
	}

	await publishUpdate(ticket);

	res.send(ticket);
};

// Soft-delete (unlist) and relist a listing.
router.delete('/api/tickets/:id', requireAuth, setListed(false));
router.post('/api/tickets/:id/relist', requireAuth, setListed(true));

export { router as unlistTicketRouter };
