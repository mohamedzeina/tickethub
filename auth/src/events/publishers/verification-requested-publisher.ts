import {
	Publisher,
	Subjects,
	UserVerificationRequestedEvent,
} from '@zeina-tickethub/common';

export class VerificationRequestedPublisher extends Publisher<UserVerificationRequestedEvent> {
	readonly subject = Subjects.UserVerificationRequested;
}
