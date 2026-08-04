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
import { ticketEventPayload } from '../ticket-event-payload';
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
				// ticketEventPayload carries EVERY replicated field: the orders
				// replica overwrites its copy from this payload, so anything omitted
				// is unset over there.
				await new TicketUpdatedPublisher(this.js).publish(
					ticketEventPayload(ticket),
				);
			},
		);

		// Ack the message
		msg.ack();
	}
}
