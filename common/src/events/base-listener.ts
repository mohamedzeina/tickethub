import { Message, Stan } from 'node-nats-streaming';
import { Subjects } from './subjects';
import { DeadLetterStore } from './dead-letter';

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
	// Opt-in (B3): a subclass that sets this gets poison-message protection — a
	// message that keeps failing is dead-lettered and acked after `maxAttempts`
	// instead of redelivering forever. Left unset, the listener keeps the B2
	// behaviour (log and retry indefinitely).
	protected deadLetterStore?: DeadLetterStore;
	// ~maxAttempts * ackWait of grace before a message is treated as poison.
	// Generous on purpose: out-of-order events normally resolve within a couple
	// of redeliveries, and a short dependency blip shouldn't dead-letter a good
	// event. Subclasses can override.
	protected maxAttempts = 10;

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
				// the preceding version arrives). Past `maxAttempts`, handleError
				// dead-letters and acks instead so a poison message can't loop.
				await this.handleError(msg, err);
			}
		});
	}

	// Decides what to do with a failed message. Without a dead-letter store it
	// keeps the B2 behaviour: log structured context and leave the message
	// un-acked so NATS retries. With a store, it counts attempts and, once the
	// cap is hit, archives the message (raw payload + last error) and acks it so
	// the redelivery loop stops. Store failures degrade safely to plain retry.
	private async handleError(msg: Message, err: unknown) {
		const error = err as Error;
		const outOfOrder = error?.name === 'VersionError';
		const context = {
			subject: this.subject,
			queueGroup: this.queueGroupName,
			sequence: msg.getSequence(),
			redelivered: msg.isRedelivered(),
			errorName: error?.name,
			error: error?.message,
		};

		if (!this.deadLetterStore) {
			this.logFailure(outOfOrder, context, 'will retry');
			return;
		}

		let attempts: number;
		try {
			attempts = await this.deadLetterStore.recordFailure(
				this.subject,
				msg.getSequence(),
			);
		} catch (storeErr) {
			// Can't reach the dead-letter store — leave un-acked and retry later
			// rather than risk acking a message we failed to record.
			this.logFailure(outOfOrder, context, 'will retry (dead-letter store unavailable)');
			return;
		}

		if (attempts < this.maxAttempts) {
			this.logFailure(outOfOrder, { ...context, attempts }, 'will retry');
			return;
		}

		try {
			await this.deadLetterStore.deadLetter({
				channel: this.subject,
				sequence: msg.getSequence(),
				queueGroup: this.queueGroupName,
				data: msg.getData().toString(),
				errorName: error?.name,
				error: error?.message,
				attempts,
			});
		} catch (storeErr) {
			// Couldn't archive it — don't ack, so it survives for another try.
			this.logFailure(outOfOrder, { ...context, attempts }, 'will retry (dead-letter write failed)');
			return;
		}

		// Archived: ack so NATS stops redelivering the poison message.
		msg.ack();
		console.error(
			`[listener] dead-lettered poison message after ${attempts} attempts: ${JSON.stringify(context)}`,
		);
	}

	// Out-of-order version conflicts are expected and logged calmly (warn);
	// everything else is a real error.
	private logFailure(outOfOrder: boolean, context: object, disposition: string) {
		const line = `[listener] ${
			outOfOrder ? 'out-of-order event' : 'failed to process event'
		}, ${disposition}: ${JSON.stringify(context)}`;
		if (outOfOrder) {
			console.warn(line);
		} else {
			console.error(line);
		}
	}

	parseMessage(msg: Message) {
		const data = msg.getData();
		return typeof data === 'string'
			? JSON.parse(data)
			: JSON.parse(data.toString('utf8'));
	}
}
