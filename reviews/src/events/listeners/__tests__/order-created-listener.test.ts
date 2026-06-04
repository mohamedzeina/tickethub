import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { OrderCreatedEvent, OrderStatus } from '@zeina-tickethub/common';
import { OrderCreatedListener } from '../order-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { TicketRef } from '../../../models/ticket-ref';
import { OrderRef } from '../../../models/order-ref';

const id = () => new mongoose.Types.ObjectId().toHexString();

const buildData = (
	ticketId: string,
	overrides: Partial<OrderCreatedEvent['data']> = {},
): OrderCreatedEvent['data'] => ({
	id: id(),
	version: 0,
	status: OrderStatus.Created,
	userId: id(),
	userEmail: 'buyer@test.com',
	expiresAt: new Date().toISOString(),
	ticket: { id: ticketId, price: 50, title: 'Coldplay' },
	...overrides,
});

it('replicates the order and resolves the seller from the ticket replica', async () => {
	const sellerId = id();
	const ticketId = id();
	await TicketRef.build({ id: ticketId, sellerId, title: 'Coldplay' }).save();

	const listener = new OrderCreatedListener(natsWrapper.connection);
	const buyerId = id();
	const data = buildData(ticketId, { userId: buyerId });
	// @ts-ignore
	const msg: JsMsg = { ack: jest.fn(), seq: 1 };

	await listener.onMessage(data, msg);

	const stored = await OrderRef.findById(data.id);
	expect(stored).not.toBeNull();
	expect(stored!.buyerId).toEqual(buyerId);
	expect(stored!.sellerId).toEqual(sellerId);
	expect(stored!.ticketId).toEqual(ticketId);
	expect(msg.ack).toHaveBeenCalled();
});

it('throws for retry when the ticket replica has not arrived yet', async () => {
	const listener = new OrderCreatedListener(natsWrapper.connection);
	const data = buildData(id()); // no TicketRef seeded
	// @ts-ignore
	const msg: JsMsg = { ack: jest.fn(), seq: 1 };

	await expect(listener.onMessage(data, msg)).rejects.toThrow('TicketRef not found');
	expect(msg.ack).not.toHaveBeenCalled();
	expect(await OrderRef.findById(data.id)).toBeNull();
});
