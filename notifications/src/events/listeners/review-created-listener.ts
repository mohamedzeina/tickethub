import { ReviewCreatedEvent, Subjects } from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { NotificationListener } from './base';
import { eventKey, notify } from './helpers';
import { NotificationType } from '../../models/notification';

// Clamp once so both halves agree and always total five glyphs. Ratings are
// 1–5 today (reviews validates on write), so this is purely defence against a
// bad or replayed payload: an unguarded n < 0 throws RangeError out of
// String.repeat, which would fail the handler and dead-letter the event.
const stars = (n: number) => {
	const filled = Math.min(5, Math.max(0, Math.round(n)));
	return '★'.repeat(filled) + '☆'.repeat(5 - filled);
};

// #9 (previously parked) — tell a seller when a buyer leaves them a review.
// In-app only; the seller's reputation page shows the detail. Idempotent.
export class ReviewCreatedListener extends NotificationListener<ReviewCreatedEvent> {
	readonly subject = Subjects.ReviewCreated;

	protected async handleEvent(data: ReviewCreatedEvent['data'], msg: JsMsg) {
		await notify({
			userId: data.sellerId,
			type: NotificationType.ReviewReceived,
			title: 'You got a new review',
			body: `A buyer rated their "${data.ticketTitle}" sale ${stars(
				data.rating,
			)} (${data.rating}/5). See it on your seller profile.`,
			dedupeKey: eventKey(this.subject, msg, data.sellerId),
		});
	}
}
