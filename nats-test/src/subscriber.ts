import nats, { Message } from 'node-nats-streaming';
import { randomBytes } from 'crypto';

console.clear();

const stan: any = nats.connect('tickethub', randomBytes(4).toString('hex'), {
	url: 'http://localhost:4222',
});

stan.on('connect', () => {
	console.log('Subscriber connected to NATS');

	const options = stan.subscriptionOptions().setManualAckMode(true);

	const subscription = stan.subscribe(
		'ticket:created',
		'subscription-queue-group',
		options,
	);
	subscription.on('message', (msg: Message) => {
		const data = msg.getData();

		if (typeof data === 'string') {
			console.log(`Received event #${msg.getSequence()}, with data: ${data}`);
		}

		msg.ack();
	});
});
