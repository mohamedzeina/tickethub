import {
	Publisher,
	PaymentRefundedEvent,
	Subjects,
} from '@zeina-tickethub/common';

export class PaymentRefundedPublisher extends Publisher<PaymentRefundedEvent> {
	readonly subject = Subjects.PaymentRefunded;
}
