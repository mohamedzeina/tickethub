import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { ExpirationWarningEvent, OrderStatus } from '@zeina-tickethub/common';
import { ExpirationWarningListener } from '../expiration-warning-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import { Notification, NotificationType } from '../../../models/notification';

const setup = async (status: OrderStatus) => {
	const listener = new ExpirationWarningListener(natsWrapper.connection);
	const userId = new mongoose.Types.ObjectId().toHexString();

	const order = Order.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		userId,
		ticketTitle: 'Akon Concert',
		status,
	});
	await order.save();

	const data: ExpirationWarningEvent['data'] = { orderId: order.id };
	// @ts-ignore
	const msg: JsMsg = { ack: jest.fn(), seq: 1 };

	return { listener, data, msg, userId };
};

it('notifies when the order is still unpaid (created)', async () => {
	const { listener, data, msg, userId } = await setup(OrderStatus.Created);
	await listener.onMessage(data, msg);

	const notifications = await Notification.find({ userId });
	expect(notifications.length).toEqual(1);
	expect(notifications[0].type).toEqual(NotificationType.HoldExpiring);
	expect(msg.ack).toHaveBeenCalled();
});

it('notifies when the order is awaiting payment', async () => {
	const { listener, data, msg, userId } = await setup(OrderStatus.AwaitingPayment);
	await listener.onMessage(data, msg);
	expect(await Notification.countDocuments({ userId })).toEqual(1);
});

it('stays silent when the order is already paid', async () => {
	const { listener, data, msg, userId } = await setup(OrderStatus.Complete);
	await listener.onMessage(data, msg);
	expect(await Notification.countDocuments({ userId })).toEqual(0);
	expect(msg.ack).toHaveBeenCalled();
});

it('stays silent when the order was cancelled', async () => {
	const { listener, data, msg, userId } = await setup(OrderStatus.Cancelled);
	await listener.onMessage(data, msg);
	expect(await Notification.countDocuments({ userId })).toEqual(0);
});
