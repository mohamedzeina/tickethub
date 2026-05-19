import { Message } from 'node-nats-streaming';
import {
	Subjects,
	Listener,
	TicketCreatedEvent,
} from '@zeina-tickethub/common';
import { Ticket } from '../../models/ticket';

export class TicketCreatedListener extends Listener<TicketCreatedEvent> {
	readonly subject = Subjects.TicketCreated;
	queueGroupName: string = 'orders-service';

	onMessage(data: TicketCreatedEvent['data'], msg: Message) {}
}
