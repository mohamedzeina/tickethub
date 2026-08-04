import {
	UserVerificationRequestedEvent,
	Subjects,
	sendMail,
	verifyEmailEmail,
} from '@zeina-tickethub/common';
import { NotificationListener } from './base';
import { clientUrl } from './format';

// auth asks us to confirm a new (or re-requested) email. We own all comms, so
// the link is built here from the raw token and CLIENT_URL. Email-only — no
// in-app notification, since the user isn't "in" until they verify.
export class UserVerificationRequestedListener extends NotificationListener<UserVerificationRequestedEvent> {
	readonly subject = Subjects.UserVerificationRequested;

	protected async handleEvent(data: UserVerificationRequestedEvent['data']) {
		const verifyUrl = `${clientUrl()}/auth/verify-email?token=${data.token}`;
		await sendMail(verifyEmailEmail({ to: data.email, verifyUrl }));
	}
}
