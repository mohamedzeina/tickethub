import {
	Publisher,
	TicketRedeemedEvent,
	Subjects,
} from '@zeina-tickethub/common';

export class TicketRedeemedPublisher extends Publisher<TicketRedeemedEvent> {
	readonly subject = Subjects.TicketRedeemed;
}
