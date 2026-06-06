import {
	Publisher,
	Subjects,
	ReviewCreatedEvent,
} from '@zeina-tickethub/common';

export class ReviewCreatedPublisher extends Publisher<ReviewCreatedEvent> {
	readonly subject = Subjects.ReviewCreated;
}
