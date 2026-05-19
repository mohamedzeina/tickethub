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

	onMessage(data: TicketCreatedEvent['data'], msg: Message) {}
}
