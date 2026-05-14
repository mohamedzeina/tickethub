/// <reference types="node" />
import nats from 'node-nats-streaming';
import { randomBytes } from 'crypto';

console.clear();

const stan: any = nats.connect('tickethub', randomBytes(4).toString('hex'), {
	url: 'http://localhost:4222',
});

stan.on('connect', () => {
	console.log('Publisher connected to NATS');

	const data = JSON.stringify({
		id: '123',
		title: 'Concert',
		price: 100,
	});

	stan.publish('ticket:created', data, () => {
		console.log('Event published');
	});
});
