import { OrderStatus } from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { Order } from '../../models/order';
import { Notification, NotificationAttrs } from '../../models/notification';
import { isDuplicateKey } from '../../is-duplicate-key';

// Shared building blocks for the listeners. Kept here (rather than on the
// models) so the models stay plain persistence and the "why" lives next to the
// handlers that need it.

// Write one in-app feed row. Nothing downstream needs the document, so the
// build+save pair collapses to a single call.
//
// When `attrs.dedupeKey` is set, a redelivery of the same event is a no-op: the
// sparse unique index rejects the second insert and we swallow it. Handlers that
// write more than one notification are not atomic, so this is what stops a
// failure on the second write from duplicating the first when JetStream replays.
export const notify = async (attrs: NotificationAttrs) => {
	try {
		await Notification.build(attrs).save();
	} catch (err) {
		if (isDuplicateKey(err)) {
			return; // already written by an earlier delivery
		}
		throw err;
	}
};

// Key a notification to the delivery that produced it, per recipient.
//
// Deliberately derived from the message sequence rather than from business
// fields: two genuinely distinct events (a second price drop, a re-listing)
// carry different sequences and so still produce separate rows. Only a replay of
// the *same* message collides, which is exactly the case we want collapsed.
export const eventKey = (subject: string, msg: JsMsg, userId: string) =>
	`${subject}:${msg.seq}:${userId}`;

// Resolve the local order replica. Some events (payment, expiration) only carry
// an orderId and can race ahead of order:created; throw to retry until the
// replica exists rather than dropping the notification.
export const requireOrder = async (orderId: string) => {
	const order = await Order.findById(orderId);

	if (!order) {
		throw new Error('Order not found');
	}

	return order;
};

// Is the buyer still sitting on an unpaid hold? Once the order is Complete (or
// already Cancelled) the expiry warning/release messages are noise.
//
// Only safe as a guard for handlers that DON'T change the status themselves —
// see settled() for why.
export const stillHolding = (order: { status: OrderStatus }) =>
	order.status === OrderStatus.Created ||
	order.status === OrderStatus.AwaitingPayment;

// Did this order reach a paid outcome? Used by the hold-expired handler, which
// sets Cancelled itself and therefore cannot guard on stillHolding: after its
// own write, a redelivery would see Cancelled, skip, and the buyer would never
// be told their hold was released. Treating only paid outcomes as "someone else
// resolved this" keeps the real intent — don't tell a buyer who paid in the
// final seconds that their seat was released — while letting the handler replay
// over its own work (setting Cancelled twice is a no-op, and notify() dedupes).
export const settled = (order: { status: OrderStatus }) =>
	order.status === OrderStatus.Complete ||
	order.status === OrderStatus.Refunded;

// Should the seller hear about this order? Skip pre-#11 orders with no
// sellerId, and guard the (impossible) self-buy.
export const hasOtherSeller = <T extends { sellerId?: string; userId: string }>(
	order: T,
): order is T & { sellerId: string } =>
	!!order.sellerId && order.sellerId !== order.userId;
