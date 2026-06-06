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
			// Seed the replica so a user can save the listing and we have a price
			// baseline for future drop detection. Insert-only ($setOnInsert): if an
			// update already created the ref (create arrived late), leave its newer
			// data untouched rather than regressing version/price back to v0.
			await TicketRef.updateOne(
				{ _id: data.id },
				{
					$setOnInsert: {
						sellerId: data.userId,
						title: data.title,
						price: data.price,
						version: data.version,
						unlisted: data.unlisted ?? false,
						// A brand-new listing is buyable unless created unlisted.
						available: !(data.unlisted ?? false),
						eventDate: data.eventDate,
						venue: data.venue,
						imageUrl: data.imageUrl,
						category: data.category,
					},
				},
				{ upsert: true },
			);
		});

		msg.ack();
	}
}
