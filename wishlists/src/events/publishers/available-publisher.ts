import {
	Publisher,
	Subjects,
	WishlistAvailableEvent,
} from '@zeina-tickethub/common';

export class AvailablePublisher extends Publisher<WishlistAvailableEvent> {
	readonly subject = Subjects.WishlistAvailable;
}
