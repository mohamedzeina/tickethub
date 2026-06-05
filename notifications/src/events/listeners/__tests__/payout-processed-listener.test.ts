import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { PayoutProcessedEvent, OrderStatus } from '@zeina-tickethub/common';
import { PayoutProcessedListener } from '../payout-processed-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import { Notification, NotificationType } from '../../../models/notification';

const oid = () => new mongoose.Types.ObjectId().toHexString();

const seedOrder = async () => {
	const order = Order.build({
		id: oid(),
		userId: oid(),
		ticketTitle: 'Akon Concert',
		status: OrderStatus.Complete,
	});
	await order.save();
	return order;
};

const deliver = (data: PayoutProcessedEvent['data'], seq: number) =>
	new PayoutProcessedListener(natsWrapper.connection).onMessage(
		data,
		{ ack: jest.fn(), seq } as unknown as JsMsg,
	);

it('notifies the seller their payout was PAID, with the ticket + net amount', async () => {
	const order = await seedOrder();
	const sellerId = oid();

	await deliver({ orderId: order.id, sellerId, net: 90, status: 'paid' }, 1);

	const notes = await Notification.find({ userId: sellerId });
	expect(notes.length).toEqual(1);
	expect(notes[0].type).toEqual(NotificationType.PayoutPaid);
	expect(notes[0].body).toContain('€90.00');
	expect(notes[0].body).toContain('Akon Concert');
});

it('notifies the seller their earnings are HELD', async () => {
	const order = await seedOrder();
	const sellerId = oid();

	await deliver({ orderId: order.id, sellerId, net: 45, status: 'held' }, 1);

	const notes = await Notification.find({ userId: sellerId });
	expect(notes.length).toEqual(1);
	expect(notes[0].type).toEqual(NotificationType.PayoutHeld);
	expect(notes[0].body).toContain('€45.00');
});
