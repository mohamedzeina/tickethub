import { JetStreamClient } from 'nats';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { logger } from '../logger';
import { eventsPublished } from '../metrics';
import { eventsTracer, injectTraceHeaders } from './trace';
import { Event, jc } from './event';

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
		// Producer span; the trace headers injected inside it carry this span's
		// context to whichever service consumes the message.
		await eventsTracer().startActiveSpan(
			`${this.subject} publish`,
			{ kind: SpanKind.PRODUCER },
			async (span) => {
				try {
					const headers = injectTraceHeaders();
					await this.js.publish(this.subject, jc.encode(data), { headers });
					eventsPublished.inc({ subject: this.subject });
					logger.info({ subject: this.subject }, 'event published');
				} catch (err) {
					span.recordException(err as Error);
					span.setStatus({ code: SpanStatusCode.ERROR });
					throw err;
				} finally {
					span.end();
				}
			},
		);
	}
}
