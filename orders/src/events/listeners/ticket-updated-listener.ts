import { Message } from 'node-nats-streaming';
import {
	Subjects,
	Listener,
	TicketUpdatedEvent,
} from '@zeina-tickethub/common';
import { Ticket } from '../../models/ticket';
import { queueGroupName } from './queue-group-name';

export class TicketUpdatedListener extends Listener<TicketUpdatedEvent> {
	readonly subject = Subjects.TicketUpdated;
	queueGroupName: string = queueGroupName;

	async onMessage(data: TicketUpdatedEvent['data'], msg: Message) {
		const { id, title, price, userId, unlisted, eventDate, venue, description, category, imageUrl } =
			data;

		const ticket = await Ticket.findByEvent({ id, version: data.version });

		if (!ticket) {
			throw new Error('Ticket not found');
		}

		ticket.set({
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
