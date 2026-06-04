import {
	Listener,
	UserVerificationRequestedEvent,
	Subjects,
	processOnce,
	sendMail,
	verifyEmailEmail,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';

const clientUrl = () => process.env.CLIENT_URL || 'https://tickethub.com';

// auth asks us to confirm a new (or re-requested) email. We own all comms, so
// the link is built here from the raw token and CLIENT_URL. Email-only — no
// in-app notification, since the user isn't "in" until they verify.
export class UserVerificationRequestedListener extends Listener<UserVerificationRequestedEvent> {
	readonly subject = Subjects.UserVerificationRequested;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: UserVerificationRequestedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			const verifyUrl = `${clientUrl()}/auth/verify-email?token=${data.token}`;
			await sendMail(verifyEmailEmail({ to: data.email, verifyUrl }));
		});

		msg.ack();
	}
}
