import {
	Publisher,
	Subjects,
	TicketCreatedEvent,
} from '@zeina-tickethub/common';

export class TicketCreatedPublisher extends Publisher<TicketCreatedEvent> {
	readonly subject = Subjects.TicketCreated;
}
