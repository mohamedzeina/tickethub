import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { OrderStatus } from '@zeina-tickethub/common';
import { Order, OrderAttrs } from '../models/order';
import {
	Notification,
	NotificationAttrs,
	NotificationType,
} from '../models/notification';

// Fixtures shared by the listener + route suites. Each file still declares its
// own `jest.mock(...)` calls — jest hoists those, so they can't live here.

// Cross-service ids are plain strings, but they're always ObjectId hex in
// practice, so mint them the same way the real services do.
export const oid = () => new mongoose.Types.ObjectId().toHexString();

// Minimal JsMsg stand-in: the listeners only ever read `seq` and call `ack`.
// The returned `ack` is a fresh jest.fn(), so assert on `m.ack` directly.
export const msg = (seq: number) =>
	({ ack: jest.fn(), seq }) as unknown as JsMsg;

// Seed the local order replica the payment/expiration/payout listeners read
// back. Defaults to a settled order with no email or price; pass whatever the
// case under test actually cares about.
export const seedOrder = async (overrides: Partial<OrderAttrs> = {}) => {
	const order = Order.build({
		id: oid(),
		userId: oid(),
		ticketTitle: 'Akon Concert',
		status: OrderStatus.Complete,
		...overrides,
	});
	await order.save();
	return order;
};

// Seed a feed row for the route suites. `read` isn't a build attr (it defaults
// on the schema), so it's set after the build.
export const buildNotification = async (
	userId: string,
	overrides: Partial<NotificationAttrs> & { read?: boolean } = {},
) => {
	const { read = false, ...attrs } = overrides;

	const notification = Notification.build({
		userId,
		type: NotificationType.PaymentSucceeded,
		title: 'Payment confirmed',
		body: 'body',
		...attrs,
	});
	notification.set({ read });
	await notification.save();
	return notification;
};
