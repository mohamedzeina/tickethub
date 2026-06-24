import { JsMsg } from 'nats';
import {
	Listener,
	OrderCreatedEvent,
	Subjects,
	processOnce,
} from '@zeina-tickethub/common';
import { Ticket } from '../../models/ticket';
import { ProcessedEvent } from '../../models/processed-event';
import { TicketUpdatedPublisher } from '../publishers/ticket-updated-publisher';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';

export class OrderCreatedListner extends Listener<OrderCreatedEvent> {
	readonly subject = Subjects.OrderCreated;
	queueGroupName: string = queueGroupName;
	// B3: cap retries and dead-letter poison messages.
	protected deadLetterStore = FailedEvent;

	async onMessage(data: OrderCreatedEvent['data'], msg: JsMsg) {
		await processOnce(
			ProcessedEvent,
			this.subject,
			msg.seq,
			async () => {
				// Find the ticket that the order is reserving
				const ticket = await Ticket.findById(data.ticket.id);

				// If no ticket, throw error
				if (!ticket) {
					throw new Error('Ticket not found');
				}

				// Multi-seat (#10): a reservation consumes `quantity` seats from the
				// listing's pool. orders has already enforced the cap atomically, so
				// availableQty can't legitimately go below 0 — clamp defensively.
				const seats = data.quantity ?? 1;
				ticket.set({
					availableQty: Math.max(0, ticket.availableQty - seats),
				});

				// Save the ticket
				await ticket.save();
				await new TicketUpdatedPublisher(this.js).publish({
					id: ticket.id,
					version: ticket.version,
					title: ticket.title,
					price: ticket.price,
					quantity: ticket.quantity,
					availableQty: ticket.availableQty,
					userId: ticket.userId,
					// Carry the full descriptive fields too: the orders replica
					// overwrites its copy from this payload, so omitting these wipes
					// eventDate/venue/etc. on reserve — which silently disabled the
					// refund window's event-cutoff (it needs eventDate).
					eventDate: ticket.eventDate?.toISOString(),
					venue: ticket.venue,
					description: ticket.description,
					category: ticket.category,
					imageUrl: ticket.imageUrl,
				});
			},
		);

		// Ack the message
		msg.ack();
	}
}
