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
		// availableQty is deliberately NOT destructured: orders tracks the same
		// inventory as `reservedSeats` (its inverse), owned locally and moved only
		// by reserveSeats/releaseSeats. See models/ticket.ts.
		const { id, title, price, quantity, userId, unlisted, eventDate, venue, description, category, imageUrl } =
			data;

		const ticket = Ticket.build({
			id,
			title,
			price,
			quantity,
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
