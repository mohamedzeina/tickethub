import {
	Listener,
	TicketUpdatedEvent,
	Subjects,
	processOnce,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { TicketRef } from '../../models/ticket-ref';

export class TicketUpdatedListener extends Listener<TicketUpdatedEvent> {
	readonly subject = Subjects.TicketUpdated;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: TicketUpdatedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			// Latest-wins upsert — keep venue/date current; tolerate an update that
			// lands before the create (cosmetic fields only).
			await TicketRef.findByIdAndUpdate(
				data.id,
				{ title: data.title, venue: data.venue, eventDate: data.eventDate },
				{ upsert: true },
			);
		});

		msg.ack();
	}
}
