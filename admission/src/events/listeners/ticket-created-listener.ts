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
import { upsertTicketRef } from './upsert-ticket-ref';

export class TicketCreatedListener extends Listener<TicketCreatedEvent> {
	readonly subject = Subjects.TicketCreated;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: TicketCreatedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			// Record venue/date so a minted pass can show the event details at the
			// gate.
			await upsertTicketRef(data);
		});

		msg.ack();
	}
}
