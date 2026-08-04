import { TicketCreatedEvent } from '@zeina-tickethub/common';
import { TicketCreatedListener } from '../ticket-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Ticket } from '../../../models/ticket';
import { oid, fakeMsg } from '../../../test/factories';

const setup = async () => {
	// Create an instance of the listener
	const listener = new TicketCreatedListener(natsWrapper.connection);
	// Create a fake data event
	const data: TicketCreatedEvent['data'] = {
		version: 0,
		id: oid(),
		title: 'Akon Concert',
		price: 10,
		userId: oid(),
	};

	// Create a fake message object
	const msg = fakeMsg();

	return { listener, data, msg };
};

it('creates and saves a ticket', async () => {
	const { listener, data, msg } = await setup();

	// Call the onMessage function with the data and message object
	await listener.onMessage(data, msg);

	// Write assertions to make sure a ticket was created
	const ticket = await Ticket.findById(data.id);

	expect(ticket).toBeDefined();
	expect(ticket!.title).toEqual(data.title);
	expect(ticket!.price).toEqual(data.price);
});
it('acks the message', async () => {
	const { listener, data, msg } = await setup();

	// Call the onMessage function with the data and message object
	await listener.onMessage(data, msg);

	// Write assertions to make sure the message was acknowledged
	expect(msg.ack).toHaveBeenCalled();
});
