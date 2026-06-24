import { Subjects } from '../subjects';

export interface TicketUpdatedEvent {
	subject: Subjects.TicketUpdated;
	data: {
		id: string;
		version: number;
		title: string;
		price: number;
		userId: string;
		orderId?: string;
		// Multi-seat (#10). quantity = total seats listed; availableQty = seats still
		// on sale. availableQty is the new "on sale?" signal (replaces relying on a
		// single orderId): > 0 means at least one seat is still buyable. Optional so
		// pre-#10 events replay cleanly — consumers treat a missing value as 1.
		quantity?: number;
		availableQty?: number;
		// Optional so older publishers/consumers stay compatible.
		eventDate?: string;
		venue?: string;
		description?: string;
		category?: string;
		imageUrl?: string;
		// Soft-delete flag so consumers can stop a hidden listing being reserved.
		unlisted?: boolean;
	};
}
