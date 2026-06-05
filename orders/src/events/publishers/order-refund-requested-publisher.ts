import {
	Publisher,
	OrderRefundRequestedEvent,
	Subjects,
} from '@zeina-tickethub/common';

export class OrderRefundRequestedPublisher extends Publisher<OrderRefundRequestedEvent> {
	readonly subject = Subjects.OrderRefundRequested;
}
