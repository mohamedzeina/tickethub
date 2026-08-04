import { OrderCreatedEvent, OrderStatus } from '@zeina-tickethub/common';
import { OrderCreatedListner } from '../order-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Ticket } from '../../../models/ticket';
import { JSONCodec } from 'nats';
import { oid, fakeMsg } from '../../../test/factories';

const setup = async () => {
	// Create an instance of the listener
	const listener = new OrderCreatedListner(natsWrapper.connection);

	// Create and save a 5-seat ticket (fully available)
	const ticket = await Ticket.build({
		title: 'Akon Concert',
		price: 200,
		quantity: 5,
		userId: '123',
	});

	await ticket.save();

	// Create fake data event — this order reserves 2 of the 5 seats
	const data: OrderCreatedEvent['data'] = {
		id: oid(),
		version: 0,
		status: OrderStatus.Created,
		userId: '123',
		userEmail: 'buyer@test.com',
		expiresAt: '123',
		quantity: 2,
		ticket: {
			id: ticket.id,
			price: ticket.price,
			title: ticket.title,
		},
	};

	// Create Fake message
	const msg = fakeMsg(1);

	return { listener, data, ticket, msg };
};

it('decrements availableQty by the order quantity', async () => {
	const { listener, ticket, data, msg } = await setup();

	await listener.onMessage(data, msg);

	const orderedTicket = await Ticket.findById(ticket.id);

	expect(orderedTicket!.availableQty).toEqual(3);
	expect(orderedTicket!.quantity).toEqual(5);
});

it('acks the message', async () => {
	const { listener, data, msg } = await setup();

	await listener.onMessage(data, msg);

	expect(msg.ack).toHaveBeenCalled();
});

it('publishes a ticket updated event carrying the new availableQty', async () => {
	const { listener, data, msg } = await setup();

	await listener.onMessage(data, msg);

	expect(natsWrapper.js.publish).toHaveBeenCalled();

	const ticketUpdatedData = JSONCodec().decode(
		(natsWrapper.js.publish as jest.Mock).mock.calls[0][1],
	) as any;

	expect(ticketUpdatedData.availableQty).toEqual(3);
	expect(ticketUpdatedData.quantity).toEqual(5);
});

it('reserves the seats only once for a redelivered (duplicate) event', async () => {
	const { listener, ticket, data, msg } = await setup();

	await listener.onMessage(data, msg);
	await listener.onMessage(data, msg);

	// Reservation published a single time (version bumped once).
	expect(natsWrapper.js.publish).toHaveBeenCalledTimes(1);

	const reservedTicket = await Ticket.findById(ticket.id);
	expect(reservedTicket!.availableQty).toEqual(3);
	expect(reservedTicket!.version).toEqual(ticket.version + 1);

	expect(msg.ack).toHaveBeenCalledTimes(2);
});
