import {
	WishlistPriceDroppedEvent,
	Subjects,
	sendMail,
	priceDropEmail,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { NotificationListener } from './base';
import { clientUrl, money } from './format';
import { eventKey, notify } from './helpers';
import { NotificationType } from '../../models/notification';

// #16 — a listing a user saved dropped in price. The wishlists service emits one
// event per watcher, so this is a straight 1:1 deliver: an in-app feed item +
// (best-effort) an email. Idempotent via processOnce on the message sequence.
export class WishlistPriceDroppedListener extends NotificationListener<WishlistPriceDroppedEvent> {
	readonly subject = Subjects.WishlistPriceDropped;

	protected async handleEvent(
		data: WishlistPriceDroppedEvent['data'],
		msg: JsMsg,
	) {
		await notify({
			userId: data.userId,
			type: NotificationType.PriceDrop,
			title: 'Price drop on your wishlist',
			body: `"${data.title}" dropped from ${money(data.oldPrice)} to ${money(
				data.newPrice,
			)}. Grab it before it changes again.`,
			ticketId: data.ticketId,
			dedupeKey: eventKey(this.subject, msg, data.userId),
		});

		// Best-effort email. sendMail never throws; skip if we have no address
		// (older saved entries that predate email capture).
		if (data.email) {
			await sendMail(
				priceDropEmail({
					to: data.email,
					ticketTitle: data.title,
					ticketId: data.ticketId,
					oldPrice: data.oldPrice,
					newPrice: data.newPrice,
					ticketUrl: `${clientUrl()}/tickets/${data.ticketId}`,
				}),
			);
		}
	}
}
