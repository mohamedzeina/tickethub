import express, { Request, Response } from 'express';
import { requireAuth } from '@zeina-tickethub/common';
import { Wishlist } from '../models/wishlist';
import { TicketRef } from '../models/ticket-ref';

const router = express.Router();

// The current user's saved listings, newest first, joined with current ticket
// details from the replica so a rename / price change shows live. `ticket` is
// shaped like a tickets-service listing (userId = seller) so the client can feed
// it straight into <TicketCard>. Entries whose replica hasn't arrived yet return
// ticket: null and the client skips them.
router.get(
	'/api/wishlists',
	requireAuth,
	async (req: Request, res: Response) => {
		const items = await Wishlist.find({
			userId: req.currentUser!.id,
		}).sort({ createdAt: -1 });

		const ids = items.map((i) => i.ticketId);
		const refs = await TicketRef.find({ _id: { $in: ids } });
		const byId = new Map(refs.map((r) => [r.id, r]));

		const result = items.map((i) => {
			const t = byId.get(i.ticketId);
			return {
				ticketId: i.ticketId,
				savedAt: i.createdAt,
				ticket: t
					? {
							id: t.id,
							title: t.title,
							price: t.price,
							userId: t.sellerId,
							unlisted: t.unlisted,
							eventDate: t.eventDate,
							venue: t.venue,
							imageUrl: t.imageUrl,
							category: t.category,
					  }
					: null,
			};
		});

		res.send(result);
	},
);

export { router as listWishlistRouter };
