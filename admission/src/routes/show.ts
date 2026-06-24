import express, { Request, Response } from 'express';
import {
	requireAuth,
	NotAuthorizedError,
	NotFoundError,
} from '@zeina-tickethub/common';
import { Pass, PassStatus } from '../models/pass';
import { signPass } from '../services/code';

const router = express.Router();

// The buyer's admission passes for an order — drives the QR(s) + status on the
// receipt. Multi-seat (#10): an order can have several passes, returned as an
// array (seat order). Buyer-only: a pass code is a bearer credential, so we never
// expose it (or even its existence) to anyone but the order's owner.
router.get(
	'/api/passes/order/:orderId',
	requireAuth,
	async (req: Request, res: Response) => {
		const passes = await Pass.find({ orderId: req.params.orderId }).sort({
			seat: 1,
		});

		// Treat no passes like a non-owner to avoid leaking existence.
		if (passes.length === 0) {
			throw new NotFoundError();
		}
		if (passes[0].buyerId !== req.currentUser!.id) {
			throw new NotAuthorizedError();
		}

		res.status(200).send({
			passes: passes.map((pass) => ({
				id: pass.id,
				seat: pass.seat,
				status: pass.status,
				eventTitle: pass.eventTitle,
				venue: pass.venue,
				eventDate: pass.eventDate,
				redeemedAt: pass.redeemedAt,
				// Only an issued pass yields a usable code; redeemed/revoked is dead.
				code: pass.status === PassStatus.Issued ? signPass(pass.id) : null,
			})),
		});
	},
);

export { router as showPassRouter };
