import { OrderStatus } from '@zeina-tickethub/common';

// The buyer refund policy (#6 tail). A paid order is refundable until the SOONER
// of: `paidAt + REFUND_WINDOW_HOURS` (a cooling-off period) and
// `eventDate − REFUND_EVENT_CUTOFF_HOURS` (no refunds right before the event).
// If the event is already within the cutoff at purchase, the sale is final.
const HOUR_MS = 3600 * 1000;
const windowHours = () => Number(process.env.REFUND_WINDOW_HOURS ?? 24);
const eventCutoffHours = () => Number(process.env.REFUND_EVENT_CUTOFF_HOURS ?? 48);

// `order` may carry a populated `ticket` (with eventDate) or not — callers that
// need the event bound must populate it. Returns null if the order was never paid.
export const refundableUntil = (order: any): Date | null => {
	if (!order?.paidAt) return null;
	const byWindow = new Date(order.paidAt).getTime() + windowHours() * HOUR_MS;
	const eventAt =
		order.ticket && order.ticket.eventDate
			? new Date(order.ticket.eventDate).getTime()
			: null;
	const byEvent = eventAt != null ? eventAt - eventCutoffHours() * HOUR_MS : Infinity;
	return new Date(Math.min(byWindow, byEvent));
};

// True when a buyer may still request a refund: the order is paid (Complete),
// hasn't been scanned in (redeemed), and we're inside the window.
export const isRefundable = (order: any): boolean => {
	if (order?.status !== OrderStatus.Complete) return false;
	if (order?.redeemedAt) return false;
	const until = refundableUntil(order);
	return !!until && until.getTime() > Date.now();
};
