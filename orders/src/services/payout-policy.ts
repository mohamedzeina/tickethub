import { OrderStatus } from '@zeina-tickethub/common';
import { OrderDoc } from '../models/order';

// #11 payouts — the one definition of "this sale is payable to its seller":
// Complete + paid, no refund in flight or already settled, and not yet swept.
// The sweep and the seller earnings view both read from here so the two can't
// drift (earnings excluded refunded orders, the sweep didn't — masked only by
// the Complete status a refunded order no longer has).
export const PAYABLE_ORDER_FILTER = {
	status: OrderStatus.Complete,
	paidAt: { $exists: true, $ne: null },
	payoutDueAt: { $exists: false },
	refundRequestedAt: { $exists: false }, // refund in flight → don't pay out
	refundedAt: { $exists: false },
};

// Multi-seat (#10): the gross sale is the per-seat price times seats sold.
// undefined when the (populated) ticket replica carries no price — callers decide
// whether that's "skip this order" or "show zero".
export const grossAmount = (order: OrderDoc): number | undefined =>
	order.ticket?.price != null
		? order.ticket.price * (order.quantity ?? 1)
		: undefined;
