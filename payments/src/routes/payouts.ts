import express, { Request, Response } from 'express';
import { requireAuth } from '@zeina-tickethub/common';
import { Payout } from '../models/payout';

const router = express.Router();

// #11 — GET /api/payments/payouts — the signed-in seller's earnings (their own
// sales). Returns each payout (net = sale − platform fee) plus pending/paid
// totals for the account-page earnings summary. "pending" = money we're holding
// because they haven't connected a payout account yet.
const round2 = (n: number) => Math.round(n * 100) / 100;

router.get(
	'/api/payments/payouts',
	requireAuth,
	async (req: Request, res: Response) => {
		const sellerId = req.currentUser!.id;
		const payouts = await Payout.find({ sellerId }).sort({ createdAt: -1 });

		let paid = 0;
		let pending = 0;
		const items = payouts.map((p) => {
			const net = round2(p.amount - p.fee);
			if (p.status === 'paid') paid += net;
			else if (p.status === 'pending_account') pending += net;
			return {
				id: p.id,
				orderId: p.orderId,
				amount: p.amount,
				fee: p.fee,
				net,
				status: p.status,
				transferId: p.transferId,
			};
		});

		res.send({
			totals: { paid: round2(paid), pending: round2(pending) },
			payouts: items,
		});
	},
);

export { router as payoutsRouter };
