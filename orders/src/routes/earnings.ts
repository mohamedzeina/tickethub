import express, { Request, Response } from 'express';
import { requireAuth } from '@zeina-tickethub/common';
import { Order } from '../models/order';
import { Ticket } from '../models/ticket';
import { refundableUntil } from '../services/refund-window';
import { PAYABLE_ORDER_FILTER, grossAmount } from '../services/payout-policy';

const router = express.Router();

// Platform fee in basis points (1000 = 10%) — mirrors payments' feeBps so the
// "clearing" net matches the held/paid net the seller later sees. Integer-cents
// floor so we never over-state earnings.
const BPS_DIVISOR = 10_000; // basis points per whole unit
const DEFAULT_FEE_BPS = 1_000; // 10%
const feeBps = () => Number(process.env.PLATFORM_FEE_BPS ?? DEFAULT_FEE_BPS);
const netOf = (amount: number) => {
	const cents = Math.round(amount * 100);
	const fee = Math.floor((cents * feeBps()) / BPS_DIVISOR);
	return (cents - fee) / 100;
};

// #11 — GET /api/orders/earnings — the signed-in seller's *pending* earnings:
// sales that are paid but still inside their refund window, so payments hasn't
// swept them into a Payout yet. This is the "Clearing" state shown before a sale
// becomes Held/Paid on the payouts tab. Buyer-facing money (their own orders) is
// unaffected.
router.get(
	'/api/orders/earnings',
	requireAuth,
	async (req: Request, res: Response) => {
		const sellerId = req.currentUser!.id;

		// Orders reference a Ticket by id; the ticket carries the seller (userId).
		const myTickets = await Ticket.find({ userId: sellerId }).select('_id');
		if (myTickets.length === 0) {
			return res.send({ totals: { clearing: 0 }, sales: [] });
		}
		const ticketIds = myTickets.map((t) => t._id);

		// The same "payable" definition the payout sweep uses, narrowed to this
		// seller's listings. Redeemed orders stay payable, so keep them.
		const orders = await Order.find({
			ticket: { $in: ticketIds },
			...PAYABLE_ORDER_FILTER,
		})
			.sort({ _id: -1 })
			.populate('ticket');

		let clearing = 0;
		const sales = orders.map((o) => {
			// A priceless ticket replica shows as a zero sale rather than being hidden.
			const amount = grossAmount(o) ?? 0;
			const net = netOf(amount);
			clearing += net;
			return {
				orderId: o.id,
				title: o.ticket?.title || 'your sale',
				amount,
				net,
				clearsAt: refundableUntil(o),
			};
		});

		res.send({
			totals: { clearing: Math.round(clearing * 100) / 100 },
			sales,
		});
	},
);

export { router as sellerEarningsRouter };
