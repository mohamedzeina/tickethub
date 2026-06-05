import {
	Publisher,
	PayoutProcessedEvent,
	Subjects,
} from '@zeina-tickethub/common';

export class PayoutProcessedPublisher extends Publisher<PayoutProcessedEvent> {
	readonly subject = Subjects.PayoutProcessed;
}
