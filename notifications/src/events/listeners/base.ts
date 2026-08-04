import { Listener, Subjects, processOnce } from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';

// The base `Listener` keeps its event shape private, so mirror it here to get
// the same `T['data']` inference on subclasses.
interface Event {
	subject: Subjects;
	data: any;
}

// Every listener in this service shares the same wiring: one queue group, the
// FailedEvent dead-letter store, and an at-least-once delivery guarded by
// `processOnce` on the message sequence before the ack. Subclasses supply only
// the subject and the work.
//
// Note the ack sits *after* the await: if `handleEvent` throws, we never ack, so
// JetStream redelivers (and eventually dead-letters). Returning early from
// `handleEvent` means "nothing more to do" and still acks.
//
// Named `handleEvent` rather than `handle` because the base `Listener` already
// has a private `handle` driving its consume loop.
export abstract class NotificationListener<T extends Event> extends Listener<T> {
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	protected abstract handleEvent(data: T['data'], msg: JsMsg): Promise<void>;

	async onMessage(data: T['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			await this.handleEvent(data, msg);
		});

		msg.ack();
	}
}
