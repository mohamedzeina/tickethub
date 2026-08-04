import { OrderStatus } from '@zeina-tickethub/common';
import { Order } from '../../models/order';
import { Notification, NotificationAttrs } from '../../models/notification';

// Shared building blocks for the listeners. Kept here (rather than on the
// models) so the models stay plain persistence and the "why" lives next to the
// handlers that need it.

// Write one in-app feed row. Nothing downstream needs the document, so the
// build+save pair collapses to a single call.
export const notify = async (attrs: NotificationAttrs) => {
	await Notification.build(attrs).save();
};

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
export const stillHolding = (order: { status: OrderStatus }) =>
	order.status === OrderStatus.Created ||
	order.status === OrderStatus.AwaitingPayment;

// Should the seller hear about this order? Skip pre-#11 orders with no
// sellerId, and guard the (impossible) self-buy.
export const hasOtherSeller = <T extends { sellerId?: string; userId: string }>(
	order: T,
): order is T & { sellerId: string } =>
	!!order.sellerId && order.sellerId !== order.userId;
