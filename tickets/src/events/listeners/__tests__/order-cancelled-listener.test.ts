import { OrderCancelledEvent, OrderStatus } from '@zeina-tickethub/common';
import { OrderCancelledListener } from '../order-cancelled-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Ticket } from '../../../models/ticket';
import mongoose from 'mongoose';
import { JsMsg, JSONCodec } from 'nats';

const setup = async () => {
	// Create an instance of the listener
	const listener = new OrderCancelledListener(natsWrapper.connection);

	const orderId = new mongoose.Types.ObjectId().toHexString();
	// Create and save a ticket
	const ticket = await Ticket.build({
		title: 'Akon Concert',
		price: 200,
		userId: '123',
	});

	await ticket.save();

	ticket.set({ orderId });
	await ticket.save();

	// Create fake data event
	const data: OrderCancelledEvent['data'] = {
		id: new mongoose.Types.ObjectId().toHexString(),
		version: 2,
		ticket: {
			id: ticket.id,
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

it('empties the orderId of the ticket, publishes an event, and acks message', async () => {
	const { listener, ticket, data, msg } = await setup();

	await listener.onMessage(data, msg);

	const orderedTicket = await Ticket.findById(ticket.id);

	expect(orderedTicket!.orderId).not.toBeDefined();
	expect(msg.ack).toHaveBeenCalled();
	expect(natsWrapper.js.publish).toHaveBeenCalled();

	const ticketUpdatedData = (JSONCodec().decode((natsWrapper.js.publish as jest.Mock).mock.calls[0][1]) as any);

	expect(ticketUpdatedData.orderId).not.toBeDefined();
});

it('releases the reservation only once for a redelivered (duplicate) event', async () => {
	const { listener, ticket, data, msg } = await setup();

	await listener.onMessage(data, msg);
	await listener.onMessage(data, msg);

	expect(natsWrapper.js.publish).toHaveBeenCalledTimes(1);

	const releasedTicket = await Ticket.findById(ticket.id);
	expect(releasedTicket!.orderId).not.toBeDefined();

	expect(msg.ack).toHaveBeenCalledTimes(2);
});
