import { ReviewCreatedEvent, Subjects } from '@zeina-tickethub/common';
import { NotificationListener } from './base';
import { notify } from './helpers';
import { NotificationType } from '../../models/notification';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));

// #9 (previously parked) — tell a seller when a buyer leaves them a review.
// In-app only; the seller's reputation page shows the detail. Idempotent.
export class ReviewCreatedListener extends NotificationListener<ReviewCreatedEvent> {
	readonly subject = Subjects.ReviewCreated;

	protected async handleEvent(data: ReviewCreatedEvent['data']) {
		await notify({
			userId: data.sellerId,
			type: NotificationType.ReviewReceived,
			title: 'You got a new review',
			body: `A buyer rated their "${data.ticketTitle}" sale ${stars(
				data.rating,
			)} (${data.rating}/5). See it on your seller profile.`,
		});
	}
}
