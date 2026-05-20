import { Message } from 'node-nats-streaming';
import {
	Listener,
	OrderCancelledEvent,
	Subjects,
} from '@zeina-tickethub/common';
import { Ticket } from '../../models/ticket';
import { TicketUpdatedPublisher } from '../publishers/ticket-updated-publisher';
import { queueGroupName } from './queue-group-name';

export class OrderCancelledListener extends Listener<OrderCancelledEvent> {
	readonly subject = Subjects.OrderCancelled;
	queueGroupName: string = queueGroupName;

	async onMessage(data: OrderCancelledEvent['data'], msg: Message) {
		// Find the ticket that the order is reserving
		const ticket = await Ticket.findById(data.ticket.id);

		// If no ticket, throw error
		if (!ticket) {
			throw new Error('Ticket not found');
		}

		// Mark the ticket as being reserved by setting the orderId
		ticket.set({ orderId: undefined });

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

		// Ack the message
		msg.ack();
	}
}
