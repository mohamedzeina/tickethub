import {
	Publisher,
	PaymentInitiatedEvent,
	Subjects,
} from '@zeina-tickethub/common';

export class PaymentInitiatedPublisher extends Publisher<PaymentInitiatedEvent> {
	readonly subject = Subjects.PaymentInitiated;
}
