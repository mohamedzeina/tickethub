import {
	Publisher,
	ExpirationWarningEvent,
	Subjects,
} from '@zeina-tickethub/common';

export class ExpirationWarningPublisher extends Publisher<ExpirationWarningEvent> {
	readonly subject = Subjects.ExpirationWarning;
}
