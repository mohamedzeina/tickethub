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
			// Keep the cached title fresh (the seller never changes). Upsert so an
			// update that somehow lands before the create still records the mapping.
			await TicketRef.updateOne(
				{ _id: data.id },
				{ $set: { sellerId: data.userId, title: data.title } },
				{ upsert: true },
			);
		});

		msg.ack();
	}
}
