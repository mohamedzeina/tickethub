import {
	PasswordResetRequestedEvent,
	Subjects,
	sendMail,
	passwordResetEmail,
} from '@zeina-tickethub/common';
import { NotificationListener } from './base';
import { clientUrl } from './format';

// auth asks us to send a password-reset link. Email-only and best-effort.
export class PasswordResetRequestedListener extends NotificationListener<PasswordResetRequestedEvent> {
	readonly subject = Subjects.PasswordResetRequested;

	protected async handleEvent(data: PasswordResetRequestedEvent['data']) {
		const resetUrl = `${clientUrl()}/auth/reset-password?token=${data.token}`;
		await sendMail(passwordResetEmail({ to: data.email, resetUrl }));
	}
}
