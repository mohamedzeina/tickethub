import {
	Publisher,
	Subjects,
	PasswordResetRequestedEvent,
} from '@zeina-tickethub/common';

export class PasswordResetRequestedPublisher extends Publisher<PasswordResetRequestedEvent> {
	readonly subject = Subjects.PasswordResetRequested;
}
