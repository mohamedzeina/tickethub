import {
	Publisher,
	Subjects,
	TicketUpdatedEvent,
} from '@zeina-tickethub/common';

export class TicketUpdatedPublisher extends Publisher<TicketUpdatedEvent> {
	readonly subject = Subjects.TicketUpdated;
}
