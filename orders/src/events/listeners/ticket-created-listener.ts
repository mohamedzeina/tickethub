import { JsMsg } from 'nats';
import {
	Subjects,
	Listener,
	TicketCreatedEvent,
} from '@zeina-tickethub/common';
import { Ticket } from '../../models/ticket';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';

export class TicketCreatedListener extends Listener<TicketCreatedEvent> {
	readonly subject = Subjects.TicketCreated;
	queueGroupName: string = queueGroupName;
	// B3: cap retries and dead-letter poison messages.
	protected deadLetterStore = FailedEvent;

	async onMessage(data: TicketCreatedEvent['data'], msg: JsMsg) {
		const { id, title, price, userId, unlisted, eventDate, venue, description, category, imageUrl } =
			data;

		const ticket = Ticket.build({
			id,
			title,
			price,
			userId,
			unlisted,
			eventDate,
			venue,
			description,
			category,
			imageUrl,
		});

		await ticket.save();

		msg.ack();
	}
}
