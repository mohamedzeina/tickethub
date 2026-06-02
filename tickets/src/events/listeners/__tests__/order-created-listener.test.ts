import { OrderCreatedEvent, OrderStatus } from '@zeina-tickethub/common';
import { OrderCreatedListner } from '../order-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Ticket } from '../../../models/ticket';
import mongoose from 'mongoose';
import { JsMsg, JSONCodec } from 'nats';

const setup = async () => {
	// Create an instance of the listener
	const listener = new OrderCreatedListner(natsWrapper.connection);

	// Create and save a ticket
	const ticket = await Ticket.build({
		title: 'Akon Concert',
		price: 200,
		userId: '123',
	});

	await ticket.save();

	// Create fake data event
	const data: OrderCreatedEvent['data'] = {
		id: new mongoose.Types.ObjectId().toHexString(),
		version: 0,
		status: OrderStatus.Created,
		userId: '123',
		expiresAt: '123',
		ticket: {
			id: ticket.id,
			price: ticket.price,
		},
	};

	// Create Fake message
	// @ts-ignore
	const msg: JsMsg = {
		ack: jest.fn(),
		seq: 1,
	};

	return { listener, data, ticket, msg };
};

it('sets the orderId of the ticket', async () => {
	const { listener, ticket, data, msg } = await setup();

	await listener.onMessage(data, msg);

	const orderedTicket = await Ticket.findById(ticket.id);

	expect(orderedTicket!.orderId).toEqual(data.id);
});

it('acks the message', async () => {
	const { listener, data, msg } = await setup();

	await listener.onMessage(data, msg);

	expect(msg.ack).toHaveBeenCalled();
});

it('publishes a ticket updated event', async () => {
	const { listener, data, msg } = await setup();

	await listener.onMessage(data, msg);

	expect(natsWrapper.js.publish).toHaveBeenCalled();

	const ticketUpdatedData = (JSONCodec().decode((natsWrapper.js.publish as jest.Mock).mock.calls[0][1]) as any);

	expect(ticketUpdatedData.orderId).toEqual(data.id);
});

it('reserves the ticket only once for a redelivered (duplicate) event', async () => {
	const { listener, ticket, data, msg } = await setup();

	await listener.onMessage(data, msg);
	await listener.onMessage(data, msg);

	// Reservation published a single time (version bumped once).
	expect(natsWrapper.js.publish).toHaveBeenCalledTimes(1);

	const reservedTicket = await Ticket.findById(ticket.id);
	expect(reservedTicket!.orderId).toEqual(data.id);
	expect(reservedTicket!.version).toEqual(ticket.version + 1);

	expect(msg.ack).toHaveBeenCalledTimes(2);
});
