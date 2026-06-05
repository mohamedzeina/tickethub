import express, { Request, Response } from 'express';
import {
	requireAuth,
	NotAuthorizedError,
	NotFoundError,
} from '@zeina-tickethub/common';
import { Pass, PassStatus } from '../models/pass';
import { signPass } from '../services/code';

const router = express.Router();

// The buyer's admission pass for an order — drives the QR + status on the
// receipt. Buyer-only: the pass code is a bearer credential, so we never expose
// it (or even its existence) to anyone but the order's owner.
router.get(
	'/api/passes/order/:orderId',
	requireAuth,
	async (req: Request, res: Response) => {
		const pass = await Pass.findOne({ orderId: req.params.orderId });

		// Treat a missing pass like a non-owner to avoid leaking existence.
		if (!pass) {
			throw new NotFoundError();
		}
		if (pass.buyerId !== req.currentUser!.id) {
			throw new NotAuthorizedError();
		}

		res.status(200).send({
			id: pass.id,
			status: pass.status,
			eventTitle: pass.eventTitle,
			venue: pass.venue,
			eventDate: pass.eventDate,
			redeemedAt: pass.redeemedAt,
			// Only an issued pass yields a usable code; a redeemed/revoked one is dead.
			code: pass.status === PassStatus.Issued ? signPass(pass.id) : null,
		});
	},
);

export { router as showPassRouter };
