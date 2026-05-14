import nats from 'node-nats-streaming';
import { randomBytes } from 'crypto';

console.clear();

const stan: any = nats.connect('tickethub', randomBytes(4).toString('hex'), {
	url: 'http://localhost:4222',
});

stan.on('connect', () => {
	console.log('Subscriber connected to NATS');

	const subscription = stan.subscribe('ticket:created');
	subscription.on('message', (msg: any) => {
		console.log('Message Received');
	});
});
