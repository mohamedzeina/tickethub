import { JetStreamClient, JSONCodec } from 'nats';
import { Subjects } from './subjects';
import { logger } from '../logger';
import { eventsPublished } from '../metrics';

const jc = JSONCodec();

interface Event {
	subject: Subjects;
	data: any;
}

export abstract class Publisher<T extends Event> {
	abstract subject: T['subject'];
	protected js: JetStreamClient;

	constructor(js: JetStreamClient) {
		this.js = js;
	}

	// Publishes into the JetStream stream. js.publish resolves once the server
	// has persisted and ack'd the message, so a resolved promise means it's
	// durably stored (stronger than STAN's fire-and-callback).
	async publish(data: T['data']): Promise<void> {
		await this.js.publish(this.subject, jc.encode(data));
		eventsPublished.inc({ subject: this.subject });
		logger.info({ subject: this.subject }, 'event published');
	}
}
