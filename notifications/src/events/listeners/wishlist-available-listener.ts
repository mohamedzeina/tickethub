import {
	WishlistAvailableEvent,
	Subjects,
	sendMail,
	availabilityEmail,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { NotificationListener } from './base';
import { clientUrl, money } from './format';
import { eventKey, notify } from './helpers';
import { NotificationType } from '../../models/notification';

// #16 — a listing a user saved is buyable again (relisted or a hold on it
// freed). One event per watcher → in-app feed item + (best-effort) email.
// Idempotent via processOnce on the message sequence.
export class WishlistAvailableListener extends NotificationListener<WishlistAvailableEvent> {
	readonly subject = Subjects.WishlistAvailable;

	protected async handleEvent(
		data: WishlistAvailableEvent['data'],
		msg: JsMsg,
	) {
		await notify({
			userId: data.userId,
			type: NotificationType.WishlistAvailable,
			title: 'Back on sale',
			body: `"${data.title}" is available again at ${money(
				data.price,
			)}. Grab it before it's gone.`,
			ticketId: data.ticketId,
			dedupeKey: eventKey(this.subject, msg, data.userId),
		});

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
	}
}
