import { JsMsg } from 'nats';
import {
	Subjects,
	Listener,
	TicketUpdatedEvent,
} from '@zeina-tickethub/common';
import { Ticket } from '../../models/ticket';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';

export class TicketUpdatedListener extends Listener<TicketUpdatedEvent> {
	readonly subject = Subjects.TicketUpdated;
	queueGroupName: string = queueGroupName;
	// B3: cap retries and dead-letter poison messages.
	protected deadLetterStore = FailedEvent;

	async onMessage(data: TicketUpdatedEvent['data'], msg: JsMsg) {
		// availableQty is deliberately NOT destructured: orders tracks the same
		// inventory as `reservedSeats` (its inverse), owned locally and moved only
		// by reserveSeats/releaseSeats. See models/ticket.ts.
		const { id, title, price, quantity, userId, unlisted, eventDate, venue, description, category, imageUrl } =
			data;

		const ticket = await Ticket.findByEvent({ id, version: data.version });

		if (!ticket) {
			throw new Error('Ticket not found');
		}

		ticket.set({
			title,
			price,
			// Mirror seller quantity edits; keep the current value for legacy events
			// that predate multi-seat. reservedSeats is intentionally untouched here.
			quantity: quantity ?? ticket.quantity,
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
