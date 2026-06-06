import { Subjects } from '../subjects';

// Emitted by the wishlists service when a watched listing becomes buyable again
// (was unlisted/reserved, now listed + free) — one event per watcher, so
// notifications can alert each. `userId` is the watcher; `email` is captured at
// save time (optional for older entries).
export interface WishlistAvailableEvent {
	subject: Subjects.WishlistAvailable;
	data: {
		userId: string;
		email?: string;
		ticketId: string;
		title: string;
		price: number;
	};
}
