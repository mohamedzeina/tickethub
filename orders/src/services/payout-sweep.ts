import { OrderStatus, logger } from '@zeina-tickethub/common';
import { Order } from '../models/order';
import { refundableUntil } from './refund-window';
import { OrderPayoutDuePublisher } from '../events/publishers/order-payout-due-publisher';
import { natsWrapper } from '../nats-wrapper';

// #11 payouts — the release scheduler. Orders owns `refundableUntil`, so it owns
// the moment a seller becomes payable: once an order passes its refund window it
// can never be refunded, so it's safe to pay the seller. A periodic sweep (not a
// per-order delayed job) keeps this self-contained and restart-safe — every tick
// re-derives the truth from the DB.
//
// For each Complete, paid, not-yet-emitted order whose window has closed, we
// publish order:payout:due once. We publish BEFORE marking payoutDueAt so a crash
// between the two re-publishes next tick (payments is idempotent per orderId), and
// we mark with updateOne so we don't bump the order's OCC version (no event
// carries it, so replicas must not drift).
// Emit order:payout:due for one (populated) order and mark it, unless already
// emitted or the seller/price is missing. Returns true if it published. Shared by
// the sweep and the dev-only force trigger; the window check lives in the caller.
export const emitPayoutForOrder = async (order: any): Promise<boolean> => {
	// Never pay out an order that's already emitted, isn't a paid Complete order,
	// or has a refund in flight (refundRequestedAt set but the Refunded status
	// hasn't landed yet — paying out now could race the refund settling).
	if (order.payoutDueAt) return false;
	if (order.status !== OrderStatus.Complete || !order.paidAt) return false;
	if (order.refundRequestedAt) return false;

	const ticket: any = order.ticket;
	const sellerId: string | undefined = ticket?.userId;
	const amount: number | undefined = ticket?.price;
	if (!sellerId || amount == null) return false;

	await new OrderPayoutDuePublisher(natsWrapper.js).publish({
		orderId: order.id,
		sellerId,
		amount,
	});

	// updateOne (not save) so we don't bump the order's OCC version — no event
	// carries it, so replicas must not drift.
	await Order.updateOne(
		{ _id: order.id, payoutDueAt: { $exists: false } },
		{ $set: { payoutDueAt: new Date() } },
	);
	return true;
};

export const runPayoutSweep = async (): Promise<number> => {
	const candidates = await Order.find({
		status: OrderStatus.Complete,
		paidAt: { $exists: true, $ne: null },
		payoutDueAt: { $exists: false },
		refundRequestedAt: { $exists: false }, // refund in flight → don't pay out
	}).populate('ticket');

	const now = Date.now();
	let emitted = 0;

	for (const order of candidates) {
		const until = refundableUntil(order);
		if (!until || until.getTime() > now) continue; // window still open
		if (await emitPayoutForOrder(order)) emitted += 1;
	}

	return emitted;
};

// Kick off the recurring sweep. Interval is configurable so e2e can run it fast.
export const startPayoutSweep = (
	intervalMs = Number(process.env.PAYOUT_SWEEP_INTERVAL_MS ?? 60_000),
) => {
	const tick = () =>
		runPayoutSweep().catch((err) =>
			logger.error({ err }, 'payout sweep failed'),
		);
	tick(); // run once on boot
	const timer = setInterval(tick, intervalMs);
	timer.unref();
	return timer;
};
