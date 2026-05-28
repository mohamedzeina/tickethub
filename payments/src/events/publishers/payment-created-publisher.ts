import {
	Publisher,
	PaymentCreatedEvent,
	Subjects,
} from '@zeina-tickethub/common';

export class PaymentCreatedPublisher extends Publisher<PaymentCreatedEvent> {
	readonly subject = Subjects.PaymentCreated;
}
