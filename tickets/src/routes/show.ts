import express, { Request, Response } from 'express';
import { NotFoundError } from '@zeina-tickethub/common';
import { Ticket } from '../models/ticket';

const router = express.Router();

router.get('/api/tickets/:id', async (req: Request, res: Response) => {
	const ticket = await Ticket.findById(req.params.id);

	if (!ticket) {
		throw new NotFoundError();
	}

	// An unlisted ticket is hidden from everyone but its owner, so a stranger with
	// the direct link gets the same 404 as a ticket that never existed.
	if (ticket.unlisted && ticket.userId !== req.currentUser?.id) {
		throw new NotFoundError();
	}

	res.send(ticket);
});

export { router as showTicketRouter };
