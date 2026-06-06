import { Subjects } from '../subjects';

// Emitted by the wishlists service when a watched listing's price drops — one
// event per watcher, so notifications can fan out an in-app alert + email to
// each. `userId` is the watcher to notify (not the seller).
export interface WishlistPriceDroppedEvent {
	subject: Subjects.WishlistPriceDropped;
	data: {
		userId: string;
		// The watcher's email, captured when they saved the listing, so
		// notifications can send the price-drop email without a user lookup.
		// Optional for older entries that predate email capture.
		email?: string;
		ticketId: string;
		title: string;
		oldPrice: number;
		newPrice: number;
	};
}
