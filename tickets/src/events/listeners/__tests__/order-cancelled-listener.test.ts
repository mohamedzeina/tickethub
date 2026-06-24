import { OrderCancelledEvent } from '@zeina-tickethub/common';
import { OrderCancelledListener } from '../order-cancelled-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Ticket } from '../../../models/ticket';
import mongoose from 'mongoose';
import { JsMsg, JSONCodec } from 'nats';

const setup = async () => {
	// Create an instance of the listener
	const listener = new OrderCancelledListener(natsWrapper.connection);

	// Create a 5-seat ticket with 3 seats currently reserved (availableQty 2)
	const ticket = await Ticket.build({
		title: 'Akon Concert',
		price: 200,
		quantity: 5,
		userId: '123',
	});
	await ticket.save();

	ticket.set({ availableQty: 2 });
	await ticket.save();

	// Cancelled order released 3 seats
	const data: OrderCancelledEvent['data'] = {
		id: new mongoose.Types.ObjectId().toHexString(),
		version: 2,
		quantity: 3,
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

it('restores availableQty by the order quantity, publishes an event, and acks message', async () => {
	const { listener, ticket, data, msg } = await setup();

	await listener.onMessage(data, msg);

	const releasedTicket = await Ticket.findById(ticket.id);

	expect(releasedTicket!.availableQty).toEqual(5);
	expect(msg.ack).toHaveBeenCalled();
	expect(natsWrapper.js.publish).toHaveBeenCalled();

	const ticketUpdatedData = JSONCodec().decode(
		(natsWrapper.js.publish as jest.Mock).mock.calls[0][1],
	) as any;

	expect(ticketUpdatedData.availableQty).toEqual(5);
});

it('releases the reservation only once for a redelivered (duplicate) event', async () => {
	const { listener, ticket, data, msg } = await setup();

	await listener.onMessage(data, msg);
	await listener.onMessage(data, msg);

	expect(natsWrapper.js.publish).toHaveBeenCalledTimes(1);

	const releasedTicket = await Ticket.findById(ticket.id);
	// Never exceeds the listed quantity even though the event was redelivered.
	expect(releasedTicket!.availableQty).toEqual(5);

	expect(msg.ack).toHaveBeenCalledTimes(2);
});
