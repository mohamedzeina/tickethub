import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { PaymentCreatedEvent, OrderStatus } from '@zeina-tickethub/common';
import { PaymentCreatedListener } from '../payment-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import { Notification, NotificationType } from '../../../models/notification';

const seedOrder = async (userId: string) => {
	const order = Order.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		userId,
		ticketTitle: 'Akon Concert',
		status: OrderStatus.Created,
	});
	await order.save();
	return order;
};

it('marks the replica paid and creates a payment-confirmed notification', async () => {
	const listener = new PaymentCreatedListener(natsWrapper.connection);
	const userId = new mongoose.Types.ObjectId().toHexString();
	const order = await seedOrder(userId);

	const data: PaymentCreatedEvent['data'] = {
		id: new mongoose.Types.ObjectId().toHexString(),
		orderId: order.id,
		stripeId: 'pi_123',
	};
	// @ts-ignore
	const msg: JsMsg = { ack: jest.fn(), seq: 1 };

	await listener.onMessage(data, msg);

	const updated = await Order.findById(order.id);
	expect(updated!.status).toEqual(OrderStatus.Complete);

	const notifications = await Notification.find({ userId });
	expect(notifications.length).toEqual(1);
	expect(notifications[0].type).toEqual(NotificationType.PaymentSucceeded);

	expect(msg.ack).toHaveBeenCalled();
});

it('throws (for retry) when the order replica is not yet present', async () => {
	const listener = new PaymentCreatedListener(natsWrapper.connection);
	const data: PaymentCreatedEvent['data'] = {
		id: new mongoose.Types.ObjectId().toHexString(),
		orderId: new mongoose.Types.ObjectId().toHexString(),
		stripeId: 'pi_123',
	};
	// @ts-ignore
	const msg: JsMsg = { ack: jest.fn(), seq: 1 };

	await expect(listener.onMessage(data, msg)).rejects.toThrow('Order not found');
	expect(msg.ack).not.toHaveBeenCalled();
});
