import {
	Listener,
	ReviewCreatedEvent,
	Subjects,
	processOnce,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { Notification, NotificationType } from '../../models/notification';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));

// #9 (previously parked) — tell a seller when a buyer leaves them a review.
// In-app only; the seller's reputation page shows the detail. Idempotent.
export class ReviewCreatedListener extends Listener<ReviewCreatedEvent> {
	readonly subject = Subjects.ReviewCreated;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: ReviewCreatedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			await Notification.build({
				userId: data.sellerId,
				type: NotificationType.ReviewReceived,
				title: 'You got a new review',
				body: `A buyer rated their "${data.ticketTitle}" sale ${stars(
					data.rating,
				)} (${data.rating}/5). See it on your seller profile.`,
			}).save();
		});

		msg.ack();
	}
}
