import { TicketUpdatedListener } from '../ticket-updated-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { TicketUpdatedEvent } from '@zeina-tickethub/common';
import { Ticket } from '../../../models/ticket';
import { oid, fakeMsg, buildTicket } from '../../../test/factories';

const setup = async () => {
	// Create an instance of the listener
	const listener = new TicketUpdatedListener(natsWrapper.connection);

	// Create and save a ticket
	const ticket = await buildTicket({ price: 100 });

	// Create a fake data event
	const data: TicketUpdatedEvent['data'] = {
		version: ticket.version + 1,
		id: ticket.id,
		title: 'Akon Concert',
		price: 10,
		userId: oid(),
	};

	// Create a fake message object
	const msg = fakeMsg();

	return { listener, data, ticket, msg };
};

it('finds, updates, and saves a ticket', async () => {
	const { listener, data, ticket, msg } = await setup();

	// Call the onMessage function with the data and message object
	await listener.onMessage(data, msg);

	// Write assertions to make sure a ticket was updated
	const updatedTicket = await Ticket.findById(ticket.id);

	expect(updatedTicket).toBeDefined();
	expect(updatedTicket!.title).toEqual(data.title);
	expect(updatedTicket!.price).toEqual(data.price);
	expect(updatedTicket!.version).toEqual(data.version);
});

it('acks the message', async () => {
	const { msg, data, listener } = await setup();

	await listener.onMessage(data, msg);

	expect(msg.ack).toHaveBeenCalled();
});

it('propagates the unlisted flag onto the replica', async () => {
	const { listener, data, ticket, msg } = await setup();

	data.unlisted = true;

	await listener.onMessage(data, msg);

	const updatedTicket = await Ticket.findById(ticket.id);
	expect(updatedTicket!.unlisted).toEqual(true);
});

it('does not call ack if the event has a skipped version number', async () => {
	const { msg, data, listener, ticket } = await setup();

	data.version = 99;

	try {
		await listener.onMessage(data, msg);
	} catch (err) {}

	expect(msg.ack).not.toHaveBeenCalled();
});
