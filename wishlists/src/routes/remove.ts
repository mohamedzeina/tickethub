import express, { Request, Response } from 'express';
import { requireAuth } from '@zeina-tickethub/common';
import { Wishlist } from '../models/wishlist';

const router = express.Router();

// Remove a listing from the current user's wishlist. Idempotent — removing one
// that isn't there still returns 200.
router.delete(
	'/api/wishlists/:ticketId',
	requireAuth,
	async (req: Request, res: Response) => {
		const { ticketId } = req.params;
		await Wishlist.deleteOne({ userId: req.currentUser!.id, ticketId });
		res.status(200).send({ ticketId, saved: false });
	},
);

export { router as removeWishlistRouter };
