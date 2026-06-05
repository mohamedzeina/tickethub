import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { OrderCreatedEvent, TicketCreatedEvent, OrderStatus } from '@zeina-tickethub/common';
import { OrderCreatedListener } from '../order-created-listener';
import { TicketCreatedListener } from '../ticket-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { OrderRef } from '../../../models/order-ref';
import { TicketRef } from '../../../models/ticket-ref';

const msg = (seq: number) => ({ ack: jest.fn(), seq }) as unknown as JsMsg;

it('seeds a TicketRef from ticket:created (with venue + date)', async () => {
	const id = new mongoose.Types.ObjectId().toHexString();
	const listener = new TicketCreatedListener(natsWrapper.connection);
	const data: TicketCreatedEvent['data'] = {
		id,
		version: 0,
		title: 'Coldplay',
		price: 50,
		userId: new mongoose.Types.ObjectId().toHexString(),
		venue: 'Wembley',
		eventDate: new Date().toISOString(),
	};

	await listener.onMessage(data, msg(1));

	const ref = await TicketRef.findById(id);
	expect(ref!.title).toBe('Coldplay');
	expect(ref!.venue).toBe('Wembley');
});

it('seeds an OrderRef from order:created (buyer + ticket)', async () => {
	const orderId = new mongoose.Types.ObjectId().toHexString();
	const buyerId = new mongoose.Types.ObjectId().toHexString();
	const ticketId = new mongoose.Types.ObjectId().toHexString();
	const listener = new OrderCreatedListener(natsWrapper.connection);
	const data: OrderCreatedEvent['data'] = {
		id: orderId,
		version: 0,
		status: OrderStatus.Created,
		userId: buyerId,
		userEmail: 'buyer@test.com',
		expiresAt: new Date().toISOString(),
		ticket: { id: ticketId, price: 50, title: 'Coldplay' },
	};

	await listener.onMessage(data, msg(1));

	const ref = await OrderRef.findById(orderId);
	expect(ref!.buyerId).toBe(buyerId);
	expect(ref!.ticketId).toBe(ticketId);
	expect(ref!.ticketTitle).toBe('Coldplay');
});
