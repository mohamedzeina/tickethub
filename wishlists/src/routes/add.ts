import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import {
	requireAuth,
	validateRequest,
	BadRequestError,
} from '@zeina-tickethub/common';
import { Wishlist } from '../models/wishlist';
import { TicketRef } from '../models/ticket-ref';

const router = express.Router();

// Save a listing to the current user's wishlist. Idempotent — saving an
// already-saved listing is a no-op (the unique index rejects the duplicate and
// we swallow it). We don't require the ticket to exist in our replica: the
// replica may briefly lag a fresh listing, and a stray id is harmless.
router.post(
	'/api/wishlists',
	requireAuth,
	[body('ticketId').isMongoId().withMessage('a valid ticketId is required')],
	validateRequest,
	async (req: Request, res: Response) => {
		const { ticketId } = req.body;
		const userId = req.currentUser!.id;
		const userEmail = req.currentUser!.email;

		// You can't wishlist your own listing — it's meaningless (you set its
		// price) and would only alert you about your own changes. The UI hides the
		// heart on owned listings; this enforces it for direct API calls. Resolved
		// from the ticket replica's seller; if the replica hasn't arrived we can't
		// tell, so we allow it (the UI still prevents it).
		const ref = await TicketRef.findById(ticketId);
		if (ref && ref.sellerId === userId) {
			throw new BadRequestError('You cannot wishlist your own listing.');
		}

		// Idempotent upsert: saving again is a no-op but refreshes the captured
		// email (so a price-drop alert reaches the user's current address).
		await Wishlist.updateOne(
			{ userId, ticketId },
			{ $set: { userEmail } },
			{ upsert: true },
		);

		res.status(201).send({ ticketId, saved: true });
	},
);

export { router as addWishlistRouter };
