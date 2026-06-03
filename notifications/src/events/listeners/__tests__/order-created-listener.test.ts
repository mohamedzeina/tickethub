import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { OrderCreatedEvent, OrderStatus } from '@zeina-tickethub/common';
import { OrderCreatedListener } from '../order-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import { Notification, NotificationType } from '../../../models/notification';

const setup = () => {
	const listener = new OrderCreatedListener(natsWrapper.connection);

	const userId = new mongoose.Types.ObjectId().toHexString();
	const data: OrderCreatedEvent['data'] = {
		id: new mongoose.Types.ObjectId().toHexString(),
		version: 0,
		status: OrderStatus.Created,
		userId,
		userEmail: 'buyer@test.com',
		expiresAt: new Date().toISOString(),
		ticket: {
			id: new mongoose.Types.ObjectId().toHexString(),
			price: 20,
			title: 'Akon Concert',
		},
	};

	// @ts-ignore
	const msg: JsMsg = { ack: jest.fn(), seq: 1 };

	return { listener, data, msg, userId };
};

it('seeds the order replica and creates a reservation notification', async () => {
	const { listener, data, msg, userId } = setup();

	await listener.onMessage(data, msg);

	const order = await Order.findById(data.id);
	expect(order).not.toBeNull();
	expect(order!.userId).toEqual(userId);
	expect(order!.ticketTitle).toEqual('Akon Concert');
	expect(order!.status).toEqual(OrderStatus.Created);
	// Email fields carried for the centralized receipt/expiry emails (#6).
	expect(order!.userEmail).toEqual('buyer@test.com');
	expect(order!.price).toEqual(20);

	const notifications = await Notification.find({ userId });
	expect(notifications.length).toEqual(1);
	expect(notifications[0].type).toEqual(NotificationType.OrderCreated);
	expect(notifications[0].orderId).toEqual(data.id);

	expect(msg.ack).toHaveBeenCalled();
});

it('is idempotent across redelivery (same seq)', async () => {
	const { listener, data, msg, userId } = setup();

	await listener.onMessage(data, msg);
	await listener.onMessage(data, msg); // redelivery, same seq

	const notifications = await Notification.find({ userId });
	expect(notifications.length).toEqual(1);
});
