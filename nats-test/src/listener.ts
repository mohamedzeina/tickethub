import nats, { Message, Stan } from 'node-nats-streaming';
import { randomBytes } from 'crypto';

console.clear();

const stan: Stan = nats.connect('tickethub', randomBytes(4).toString('hex'), {
	url: 'http://localhost:4222',
});

stan.on('connect', () => {
	console.log('Subscriber connected to NATS');

	stan.on('close', () => {
		console.log('NATS connection closed!');
		process.exit();
	});

	new TicketCreatedListener(stan).listen();
});

process.on('SIGINT', () => stan.close());
process.on('SIGTERM', () => stan.close());

abstract class Listener {
	abstract subject: string;
	abstract queueGroupName: string;
	abstract onMessage(data: any, msg: Message): void;
	private client: Stan;
	private ackWait = 5 * 1000;

	constructor(client: Stan) {
		this.client = client;
	}

	subscriptionOptions() {
		return this.client
			.subscriptionOptions()
			.setManualAckMode(true)
			.setAckWait(this.ackWait)
			.setDeliverAllAvailable()
			.setDurableName(this.queueGroupName);
	}

	listen() {
		const subscription = this.client.subscribe(
			this.subject,
			this.queueGroupName,
			this.subscriptionOptions(),
		);

		subscription.on('message', (msg: Message) => {
			console.log(`Message received: ${this.subject} / ${this.queueGroupName}`);
			const parsedData = this.parseMessage(msg);
			this.onMessage(parsedData, msg);
			msg.ack();
		});
	}

	parseMessage(msg: Message) {
		const data = msg.getData();
		return typeof data === 'string'
			? JSON.parse(data)
			: JSON.parse(data.toString('utf8'));
	}
}

class TicketCreatedListener extends Listener {
	subject = 'ticket:created';
	queueGroupName = 'payment-service';

	onMessage(data: any, msg: Message) {
		console.log('Event data:', data);

		msg.ack();
	}
}
