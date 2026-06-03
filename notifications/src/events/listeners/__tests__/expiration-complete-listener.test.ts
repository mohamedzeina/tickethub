import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { ExpirationCompleteEvent, OrderStatus } from '@zeina-tickethub/common';
import { ExpirationCompleteListener } from '../expiration-complete-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import { Notification, NotificationType } from '../../../models/notification';

const setup = async (status: OrderStatus) => {
	const listener = new ExpirationCompleteListener(natsWrapper.connection);
	const userId = new mongoose.Types.ObjectId().toHexString();

	const order = Order.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		userId,
		ticketTitle: 'Akon Concert',
		status,
	});
	await order.save();

	const data: ExpirationCompleteEvent['data'] = { orderId: order.id };
	// @ts-ignore
	const msg: JsMsg = { ack: jest.fn(), seq: 1 };

	return { listener, data, msg, userId, order };
};

it('notifies and cancels the replica when an unpaid hold lapses', async () => {
	const { listener, data, msg, userId, order } = await setup(OrderStatus.Created);
	await listener.onMessage(data, msg);

	const updated = await Order.findById(order.id);
	expect(updated!.status).toEqual(OrderStatus.Cancelled);

	const notifications = await Notification.find({ userId });
	expect(notifications.length).toEqual(1);
	expect(notifications[0].type).toEqual(NotificationType.HoldExpired);
	expect(msg.ack).toHaveBeenCalled();
});

it('stays silent (no false "released") when the order was already paid', async () => {
	const { listener, data, msg, userId } = await setup(OrderStatus.Complete);
	await listener.onMessage(data, msg);

	expect(await Notification.countDocuments({ userId })).toEqual(0);
	expect(msg.ack).toHaveBeenCalled();
});
