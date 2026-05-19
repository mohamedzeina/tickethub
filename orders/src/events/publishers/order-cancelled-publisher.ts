import {
	Publisher,
	OrderCancelledEvent,
	Subjects,
} from '@zeina-tickethub/common';

export class OrderCancelledPublisher extends Publisher<OrderCancelledEvent> {
	readonly subject = Subjects.OrderCancelled;
}
