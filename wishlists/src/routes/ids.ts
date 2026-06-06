import express, { Request, Response } from 'express';
import { requireAuth } from '@zeina-tickethub/common';
import { Wishlist } from '../models/wishlist';

const router = express.Router();

// Just the saved ticket ids for the current user — lets the client render
// filled/empty hearts across a listing grid in one cheap call (the counterpart
// to useSellerRatings/useDisplayNames). Registered before /:ticketId so the
// literal path wins.
router.get(
	'/api/wishlists/ids',
	requireAuth,
	async (req: Request, res: Response) => {
		const items = await Wishlist.find({ userId: req.currentUser!.id }).select(
			'ticketId',
		);
		res.send({ ids: items.map((i) => i.ticketId) });
	},
);

export { router as wishlistIdsRouter };
