import {
	AckPolicy,
	DeliverPolicy,
	JetStreamClient,
	JsMsg,
	JSONCodec,
	NatsConnection,
	nanos,
} from 'nats';
import { Subjects } from './subjects';
import { DeadLetterStore } from './dead-letter';
import { STREAM_NAME } from './stream';
import { logger } from '../logger';

const jc = JSONCodec();

interface Event {
	subject: Subjects;
	data: any;
}

export abstract class Listener<T extends Event> {
	abstract subject: T['subject'];
	// Kept from the STAN model for continuity: it names the durable consumer, so
	// every replica of a service shares one consumer and JetStream load-balances
	// deliveries across them (the queue-group equivalent for pull consumers).
	abstract queueGroupName: string;
	// Handlers ack on their own success path. On throw, the base nak()s for
	// redelivery; past the delivery cap it dead-letters and term()s.
	abstract onMessage(data: T['data'], msg: JsMsg): Promise<void> | void;

	protected nc: NatsConnection;
	protected js: JetStreamClient;
	// Fallback redelivery if the process dies mid-handle without ack/nak.
	private ackWait = 30 * 1000;
	// Explicit backoff applied on nak(), matching the old ~5s redelivery cadence.
	private retryDelay = 5 * 1000;
	// Logical poison threshold: dead-letter on the Nth failed delivery. The
	// consumer's hard max_deliver is set a little higher (see listen) so a failed
	// dead-letter *write* on attempt N can still be retried instead of getting
	// stuck at the cap.
	protected maxAttempts = 10;
	// Opt-in dead-letter store for inspection / replay.
	protected deadLetterStore?: DeadLetterStore;
	// Handle to the background consume loop. In production it runs until the
	// connection closes (never resolves); exposed so tests can await it.
	processing?: Promise<void>;

	constructor(nc: NatsConnection) {
		this.nc = nc;
		this.js = nc.jetstream();
	}

	// Consumer names can't contain '.', '*' or '>'; the subject's ':' is
	// normalised so e.g. tickets-service + order:created -> tickets-service-order-created.
	private durableName() {
		return `${this.queueGroupName}-${this.subject}`.replace(/[.:*>]/g, '-');
	}

	async listen() {
		const durable = this.durableName();
		const jsm = await this.nc.jetstreamManager();
		try {
			await jsm.consumers.add(STREAM_NAME, {
				durable_name: durable,
				ack_policy: AckPolicy.Explicit,
				ack_wait: nanos(this.ackWait),
				// +2 buffer so a failed dead-letter write on the final logical
				// attempt can still nak()/retry rather than hit the hard cap.
				max_deliver: this.maxAttempts + 2,
				filter_subject: this.subject,
				deliver_policy: DeliverPolicy.All,
			});
		} catch (err) {
			// Consumer already exists (another replica created it) — fine.
		}

		const consumer = await this.js.consumers.get(STREAM_NAME, durable);
		const messages = await consumer.consume();
		// Background loop, kept off the caller's await so startup proceeds.
		this.processing = (async () => {
			for await (const m of messages) {
				await this.handle(m);
			}
		})();
		this.processing.catch((err) => {
			logger.error(
				{ subject: this.subject, queueGroup: this.queueGroupName, err },
				'listener consume loop failed',
			);
		});
	}

	private async handle(m: JsMsg) {
		let data: T['data'];
		try {
			data = jc.decode(m.data) as T['data'];
		} catch (err) {
			// An unparseable payload can never succeed — dead-letter it outright.
			await this.deadLetter(m, err);
			return;
		}

		try {
			await this.onMessage(data, m);
		} catch (err) {
			await this.handleError(m, err);
		}
	}

	private async handleError(m: JsMsg, err: unknown) {
		const error = err as Error;
		const outOfOrder = error?.name === 'VersionError';
		const deliveries = m.info.redeliveryCount;

		if (deliveries < this.maxAttempts) {
			this.logFailure(outOfOrder, this.context(m, error), 'will retry');
			m.nak(this.retryDelay);
			return;
		}

		// Final allowed delivery still failed -> poison message.
		await this.deadLetter(m, err);
	}

	private async deadLetter(m: JsMsg, err: unknown) {
		const error = err as Error;
		const context = this.context(m, error);

		if (this.deadLetterStore) {
			try {
				await this.deadLetterStore.deadLetter({
					channel: this.subject,
					sequence: m.seq,
					queueGroup: this.queueGroupName,
					data: this.dataString(m),
					errorName: error?.name,
					error: error?.message,
					attempts: m.info.redeliveryCount,
				});
			} catch (storeErr) {
				// Couldn't archive — nak so JetStream retries (the max_deliver
				// buffer leaves room) rather than dropping it silently.
				this.logFailure(false, context, 'will retry (dead-letter write failed)');
				m.nak(this.retryDelay);
				return;
			}
		}

		// Archived (or no store configured): stop redelivery for good.
		m.term();
		logger.error(
			{ ...context, attempts: m.info.redeliveryCount },
			'dead-lettered poison message',
		);
	}

	private context(m: JsMsg, error: Error) {
		return {
			subject: this.subject,
			queueGroup: this.queueGroupName,
			sequence: m.seq,
			deliveries: m.info.redeliveryCount,
			errorName: error?.name,
			error: error?.message,
		};
	}

	private dataString(m: JsMsg) {
		try {
			return new TextDecoder().decode(m.data);
		} catch (err) {
			return '';
		}
	}

	// Out-of-order version conflicts are expected and logged calmly (warn);
	// everything else is a real error.
	private logFailure(outOfOrder: boolean, context: object, disposition: string) {
		const msg = outOfOrder
			? 'out-of-order event, will retry'
			: 'failed to process event';
		if (outOfOrder) {
			logger.warn({ ...context, disposition }, msg);
		} else {
			logger.error({ ...context, disposition }, msg);
		}
	}
}
