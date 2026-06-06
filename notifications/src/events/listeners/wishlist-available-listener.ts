import {
	Listener,
	WishlistAvailableEvent,
	Subjects,
	processOnce,
	sendMail,
	availabilityEmail,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { Notification, NotificationType } from '../../models/notification';

const clientUrl = () => process.env.CLIENT_URL || 'https://tickethub.com';

const money = (n: number) =>
	new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n);

// #16 — a listing a user saved is buyable again (relisted or a hold on it
// freed). One event per watcher → in-app feed item + (best-effort) email.
// Idempotent via processOnce on the message sequence.
export class WishlistAvailableListener extends Listener<WishlistAvailableEvent> {
	readonly subject = Subjects.WishlistAvailable;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: WishlistAvailableEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			await Notification.build({
				userId: data.userId,
				type: NotificationType.WishlistAvailable,
				title: 'Back on sale',
				body: `"${data.title}" is available again at ${money(
					data.price,
				)}. Grab it before it's gone.`,
				ticketId: data.ticketId,
			}).save();

			if (data.email) {
				await sendMail(
					availabilityEmail({
						to: data.email,
						ticketTitle: data.title,
						ticketId: data.ticketId,
						price: data.price,
						ticketUrl: `${clientUrl()}/tickets/${data.ticketId}`,
					}),
				);
			}
		});

		msg.ack();
	}
}
