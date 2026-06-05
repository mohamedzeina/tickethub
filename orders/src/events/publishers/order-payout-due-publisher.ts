import {
	Publisher,
	OrderPayoutDueEvent,
	Subjects,
} from '@zeina-tickethub/common';

export class OrderPayoutDuePublisher extends Publisher<OrderPayoutDueEvent> {
	readonly subject = Subjects.OrderPayoutDue;
}
