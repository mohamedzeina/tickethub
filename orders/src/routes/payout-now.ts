import express, { Request, Response } from 'express';
import {
	requireAuth,
	NotFoundError,
	BadRequestError,
	OrderStatus,
} from '@zeina-tickethub/common';
import { emitPayoutForOrder } from '../services/payout-sweep';
import { loadOwnedOrder } from '../services/load-owned-order';

const router = express.Router();

// DEV/TEST ONLY — force a completed order's payout immediately, bypassing the
// refund-window wait. Lets the live e2e (and a manual demo) trigger a payout
// without waiting hours for the window to close. In production the sweep does
// this on schedule and this route does not exist.
router.post(
	'/api/orders/:orderId/payout-now',
	requireAuth,
	async (req: Request, res: Response) => {
		// Double-gated: never in production (even if the flag leaks into a prod
		// image), and only when explicitly enabled for dev/e2e.
		if (
			process.env.NODE_ENV === 'production' ||
			process.env.PAYOUTS_TEST_TRIGGER !== 'true'
		) {
			throw new NotFoundError();
		}

		// Only the order's buyer may trigger it (no forcing other people's orders).
		// The payout still goes to the legit seller regardless of caller; this is
		// just hygiene so the trigger isn't an open IDOR.
		const order = await loadOwnedOrder(req);

		if (order.status !== OrderStatus.Complete || !order.paidAt) {
			throw new BadRequestError('Only a paid, completed order can be paid out.');
		}

		const emitted = await emitPayoutForOrder(order);
		res.status(200).send({ emitted });
	},
);

export { router as payoutNowRouter };
