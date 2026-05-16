/// <reference types="node" />
import nats from 'node-nats-streaming';
import { randomBytes } from 'crypto';
import { TicketCreatedPublisher } from './events/ticket-created-publisher';

console.clear();

const stan: any = nats.connect('tickethub', randomBytes(4).toString('hex'), {
	url: 'http://localhost:4222',
});

stan.on('connect', async () => {
	console.log('Publisher connected to NATS');

	const data = {
		id: '123',
		title: 'Concert',
		price: 100,
	};

	const ticketCreatedPublisher = new TicketCreatedPublisher(stan);
	try {
		await ticketCreatedPublisher.publish(data);
		console.log('Event published successfully');
	} catch (err) {
		console.error('Failed to publish event:', err);
	}
});
