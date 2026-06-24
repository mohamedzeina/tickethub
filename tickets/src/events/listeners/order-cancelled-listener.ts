import { JsMsg } from 'nats';
import {
	Listener,
	OrderCancelledEvent,
	Subjects,
	processOnce,
} from '@zeina-tickethub/common';
import { Ticket } from '../../models/ticket';
import { ProcessedEvent } from '../../models/processed-event';
import { TicketUpdatedPublisher } from '../publishers/ticket-updated-publisher';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';

export class OrderCancelledListener extends Listener<OrderCancelledEvent> {
	readonly subject = Subjects.OrderCancelled;
	queueGroupName: string = queueGroupName;
	// B3: cap retries and dead-letter poison messages.
	protected deadLetterStore = FailedEvent;

	async onMessage(data: OrderCancelledEvent['data'], msg: JsMsg) {
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

				// Multi-seat (#10): releasing an order returns its seats to the pool,
				// capped at the listed quantity so a duplicate release can't inflate it.
				const seats = data.quantity ?? 1;
				ticket.set({
					availableQty: Math.min(
						ticket.quantity,
						ticket.availableQty + seats,
					),
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
					// Carry the full descriptive fields too (see order-created-listener):
					// the orders replica overwrites its copy from this payload, so
					// omitting these wipes eventDate/venue/etc. on relist.
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
