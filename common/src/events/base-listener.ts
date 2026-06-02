import { Message, Stan } from 'node-nats-streaming';
import { Subjects } from './subjects';

interface Event {
	subject: Subjects;
	data: any;
}

export abstract class Listener<T extends Event> {
	abstract subject: T['subject'];
	abstract queueGroupName: string;
	// Handlers ack on their own success path. If a handler throws, the message
	// is deliberately left un-acked so NATS redelivers it after `ackWait`.
	abstract onMessage(data: T['data'], msg: Message): Promise<void> | void;
	protected client: Stan;
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

		subscription.on('message', async (msg: Message) => {
			const parsedData = this.parseMessage(msg);

			try {
				await this.onMessage(parsedData, msg);
			} catch (err) {
				// Don't ack: NATS redelivers after ackWait so the event can be
				// retried (e.g. an out-of-order VersionError that resolves once
				// the preceding version arrives).
				this.handleError(msg, err);
			}
		});
	}

	// Logs structured context for a failed message instead of throwing raw, so
	// the why/where is visible across redeliveries. Version conflicts (events
	// arriving out of order) are expected and logged calmly; everything else is
	// a real error.
	private handleError(msg: Message, err: unknown) {
		const error = err as Error;
		const outOfOrder = error?.name === 'VersionError';

		const context = JSON.stringify({
			subject: this.subject,
			queueGroup: this.queueGroupName,
			sequence: msg.getSequence(),
			redelivered: msg.isRedelivered(),
			errorName: error?.name,
			error: error?.message,
		});

		if (outOfOrder) {
			console.warn(`[listener] out-of-order event, will retry: ${context}`);
		} else {
			console.error(`[listener] failed to process event, will retry: ${context}`);
		}
	}

	parseMessage(msg: Message) {
		const data = msg.getData();
		return typeof data === 'string'
			? JSON.parse(data)
			: JSON.parse(data.toString('utf8'));
	}
}
