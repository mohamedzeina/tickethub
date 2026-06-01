import { Message } from 'node-nats-streaming';
import {
	Subjects,
	Listener,
	TicketCreatedEvent,
} from '@zeina-tickethub/common';
import { Ticket } from '../../models/ticket';
import { queueGroupName } from './queue-group-name';

export class TicketCreatedListener extends Listener<TicketCreatedEvent> {
	readonly subject = Subjects.TicketCreated;
	queueGroupName: string = queueGroupName;

	async onMessage(data: TicketCreatedEvent['data'], msg: Message) {
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
