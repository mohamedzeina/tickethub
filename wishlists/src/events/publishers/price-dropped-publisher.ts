import {
	Publisher,
	Subjects,
	WishlistPriceDroppedEvent,
} from '@zeina-tickethub/common';

export class PriceDroppedPublisher extends Publisher<WishlistPriceDroppedEvent> {
	readonly subject = Subjects.WishlistPriceDropped;
}
