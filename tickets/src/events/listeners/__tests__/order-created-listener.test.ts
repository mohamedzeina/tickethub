import { OrderCreatedEvent, OrderStatus } from '@zeina-tickethub/common';
import { OrderCreatedListner } from '../order-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Ticket } from '../../../models/ticket';
import mongoose from 'mongoose';
import { Message } from 'node-nats-streaming';

const setup = async () => {
	// Create an instance of the listener
	const listener = new OrderCreatedListner(natsWrapper.client);

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
	const msg: Message = {
		ack: jest.fn(),
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
