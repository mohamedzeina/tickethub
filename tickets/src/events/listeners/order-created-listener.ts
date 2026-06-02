import { Message } from 'node-nats-streaming';
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

	async onMessage(data: OrderCreatedEvent['data'], msg: Message) {
		await processOnce(
			ProcessedEvent,
			this.subject,
			msg.getSequence(),
			async () => {
				// Find the ticket that the order is reserving
				const ticket = await Ticket.findById(data.ticket.id);

				// If no ticket, throw error
				if (!ticket) {
					throw new Error('Ticket not found');
				}

				// Mark the ticket as being reserved by setting the orderId
				ticket.set({ orderId: data.id });

				// Save the ticket
				await ticket.save();
				await new TicketUpdatedPublisher(this.client).publish({
					id: ticket.id,
					version: ticket.version,
					title: ticket.title,
					price: ticket.price,
					userId: ticket.userId,
					orderId: ticket.orderId,
				});
			},
		);

		// Ack the message
		msg.ack();
	}
}
