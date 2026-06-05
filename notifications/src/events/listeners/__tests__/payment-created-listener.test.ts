import mongoose from 'mongoose';
import { JsMsg } from 'nats';

// Mock just sendMail; keep the rest of common real (events, OrderStatus, …).
jest.mock('@zeina-tickethub/common', () => ({
	...jest.requireActual('@zeina-tickethub/common'),
	sendMail: jest.fn(),
}));

import { PaymentCreatedEvent, OrderStatus, sendMail } from '@zeina-tickethub/common';
import { PaymentCreatedListener } from '../payment-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import { Notification, NotificationType } from '../../../models/notification';

const seedOrder = async (userId: string, sellerId?: string) => {
	const order = Order.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		userId,
		ticketTitle: 'Akon Concert',
		status: OrderStatus.Created,
		userEmail: 'buyer@test.com',
		price: 20,
		sellerId,
	});
	await order.save();
	return order;
};

beforeEach(() => (sendMail as jest.Mock).mockClear());

it('marks the replica paid, notifies, and emails a receipt', async () => {
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

	expect(sendMail).toHaveBeenCalledTimes(1);
	const mail = (sendMail as jest.Mock).mock.calls[0][0];
	expect(mail.to).toEqual('buyer@test.com');
	expect(mail.subject).toContain('receipt');

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
	expect(sendMail).not.toHaveBeenCalled();
});

it('also notifies the SELLER that their ticket sold (#11)', async () => {
	const listener = new PaymentCreatedListener(natsWrapper.connection);
	const buyerId = new mongoose.Types.ObjectId().toHexString();
	const sellerId = new mongoose.Types.ObjectId().toHexString();
	const order = await seedOrder(buyerId, sellerId);

	// @ts-ignore
	const msg: JsMsg = { ack: jest.fn(), seq: 1 };
	await listener.onMessage(
		{ id: 'evt', orderId: order.id, stripeId: 'pi_1' } as PaymentCreatedEvent['data'],
		msg,
	);

	const sellerNotes = await Notification.find({ userId: sellerId });
	expect(sellerNotes.length).toEqual(1);
	expect(sellerNotes[0].type).toEqual(NotificationType.TicketSold);
	expect(sellerNotes[0].body).toContain('€20.00');
});
