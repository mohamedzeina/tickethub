import { Subjects } from '../subjects';

// Emitted by the reviews service when a buyer leaves a review, so notifications
// can tell the seller. `sellerId` is who to notify. Carries the title + rating
// so notifications needs no extra lookup.
export interface ReviewCreatedEvent {
	subject: Subjects.ReviewCreated;
	data: {
		reviewId: string;
		sellerId: string;
		buyerId: string;
		ticketTitle: string;
		rating: number;
	};
}
