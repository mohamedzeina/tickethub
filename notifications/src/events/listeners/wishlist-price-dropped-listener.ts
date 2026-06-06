import {
	Listener,
	WishlistPriceDroppedEvent,
	Subjects,
	processOnce,
	sendMail,
	priceDropEmail,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { Notification, NotificationType } from '../../models/notification';

const clientUrl = () => process.env.CLIENT_URL || 'https://tickethub.com';

const money = (n: number) =>
	new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n);

// #16 — a listing a user saved dropped in price. The wishlists service emits one
// event per watcher, so this is a straight 1:1 deliver: an in-app feed item +
// (best-effort) an email. Idempotent via processOnce on the message sequence.
export class WishlistPriceDroppedListener extends Listener<WishlistPriceDroppedEvent> {
	readonly subject = Subjects.WishlistPriceDropped;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: WishlistPriceDroppedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			await Notification.build({
				userId: data.userId,
				type: NotificationType.PriceDrop,
				title: 'Price drop on your wishlist 🔖',
				body: `"${data.title}" dropped from ${money(data.oldPrice)} to ${money(
					data.newPrice,
				)}. Grab it before it changes again.`,
				ticketId: data.ticketId,
			}).save();

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
		});

		msg.ack();
	}
}
