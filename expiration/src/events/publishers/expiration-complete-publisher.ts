import {
	Publisher,
	ExpirationCompleteEvent,
	Subjects,
} from '@zeina-tickethub/common';

export class ExpirationCompletePublisher extends Publisher<ExpirationCompleteEvent> {
	readonly subject = Subjects.ExpirationComplete;
}
