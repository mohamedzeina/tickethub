import {
	Listener,
	PasswordResetRequestedEvent,
	Subjects,
	processOnce,
	sendMail,
	passwordResetEmail,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';

const clientUrl = () => process.env.CLIENT_URL || 'https://tickethub.com';

// auth asks us to send a password-reset link. Email-only and best-effort.
export class PasswordResetRequestedListener extends Listener<PasswordResetRequestedEvent> {
	readonly subject = Subjects.PasswordResetRequested;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: PasswordResetRequestedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			const resetUrl = `${clientUrl()}/auth/reset-password?token=${data.token}`;
			await sendMail(passwordResetEmail({ to: data.email, resetUrl }));
		});

		msg.ack();
	}
}
