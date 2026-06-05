import {
	Listener,
	TicketCreatedEvent,
	Subjects,
	processOnce,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { TicketRef } from '../../models/ticket-ref';

export class TicketCreatedListener extends Listener<TicketCreatedEvent> {
	readonly subject = Subjects.TicketCreated;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: TicketCreatedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			// Record venue/date so a minted pass can show the event details at the
			// gate. Upsert (not insert) so replaying the shared persistent stream is
			// safe when an `updated` for the same ticket already seeded the ref.
			await TicketRef.findByIdAndUpdate(
				data.id,
				{ title: data.title, venue: data.venue, eventDate: data.eventDate },
				{ upsert: true },
			);
		});

		msg.ack();
	}
}
