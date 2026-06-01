import express, { Request, Response } from 'express';
import { requireAuth } from '@zeina-tickethub/common';
import { Ticket } from '../models/ticket';

const router = express.Router();

// All tickets owned by the current user — available, reserved, and sold — so a
// seller can see and manage their own listings. (The index route deliberately
// hides reserved tickets, which is why this is separate.)
router.get(
	'/api/tickets/mine',
	requireAuth,
	async (req: Request, res: Response) => {
		const tickets = await Ticket.find({ userId: req.currentUser!.id });
		res.send(tickets);
	},
);

export { router as myTicketsRouter };
