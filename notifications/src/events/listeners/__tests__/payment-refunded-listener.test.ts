import mongoose from 'mongoose';
import { JsMsg } from 'nats';

// Mock just sendMail; keep the rest of common real (events, OrderStatus, …).
jest.mock('@zeina-tickethub/common', () => ({
	...jest.requireActual('@zeina-tickethub/common'),
	sendMail: jest.fn(),
}));

import { PaymentRefundedEvent, OrderStatus, sendMail } from '@zeina-tickethub/common';
import { PaymentRefundedListener } from '../payment-refunded-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import { Notification, NotificationType } from '../../../models/notification';

const seedOrder = async (userId: string, userEmail?: string) => {
	const order = Order.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		userId,
		ticketTitle: 'Akon Concert',
		status: OrderStatus.Complete,
		userEmail,
		price: 20,
	});
	await order.save();
	return order;
};

beforeEach(() => (sendMail as jest.Mock).mockClear());

it('notifies the buyer and emails a refund confirmation', async () => {
	const listener = new PaymentRefundedListener(natsWrapper.connection);
	const userId = new mongoose.Types.ObjectId().toHexString();
	const order = await seedOrder(userId, 'buyer@test.com');

	const data: PaymentRefundedEvent['data'] = {
		id: new mongoose.Types.ObjectId().toHexString(),
		orderId: order.id,
		stripeId: 'pi_123',
	};
	// @ts-ignore
	const msg: JsMsg = { ack: jest.fn(), seq: 1 };

	await listener.onMessage(data, msg);

	const notifications = await Notification.find({ userId });
	expect(notifications.length).toEqual(1);
	expect(notifications[0].type).toEqual(NotificationType.PaymentRefunded);

	expect(sendMail).toHaveBeenCalledTimes(1);
	const mail = (sendMail as jest.Mock).mock.calls[0][0];
	expect(mail.to).toEqual('buyer@test.com');
	expect(mail.subject).toContain('refund');

	expect(msg.ack).toHaveBeenCalled();
});

it('still notifies but skips email when no buyer email is on the replica', async () => {
	const listener = new PaymentRefundedListener(natsWrapper.connection);
	const userId = new mongoose.Types.ObjectId().toHexString();
	const order = await seedOrder(userId);

	const data: PaymentRefundedEvent['data'] = {
		id: new mongoose.Types.ObjectId().toHexString(),
		orderId: order.id,
		stripeId: 'pi_123',
	};
	// @ts-ignore
	const msg: JsMsg = { ack: jest.fn(), seq: 2 };

	await listener.onMessage(data, msg);

	const notifications = await Notification.find({ userId });
	expect(notifications.length).toEqual(1);
	expect(sendMail).not.toHaveBeenCalled();
	expect(msg.ack).toHaveBeenCalled();
});

it('throws (for retry) when the order replica is not yet present', async () => {
	const listener = new PaymentRefundedListener(natsWrapper.connection);
	const data: PaymentRefundedEvent['data'] = {
		id: new mongoose.Types.ObjectId().toHexString(),
		orderId: new mongoose.Types.ObjectId().toHexString(),
		stripeId: 'pi_123',
	};
	// @ts-ignore
	const msg: JsMsg = { ack: jest.fn(), seq: 3 };

	await expect(listener.onMessage(data, msg)).rejects.toThrow('Order not found');
	expect(msg.ack).not.toHaveBeenCalled();
	expect(sendMail).not.toHaveBeenCalled();
});
