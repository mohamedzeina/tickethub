import { Subjects } from '../subjects';

export interface TicketCreatedEvent {
	subject: Subjects.TicketCreated;
	data: {
		id: string;
		version: number;
		title: string;
		price: number;
		userId: string;
		// Multi-seat (#10). quantity = total seats listed; availableQty = seats still
		// on sale (quantity minus active reservations). Optional so pre-#10 events
		// (single-unit) replay cleanly — consumers treat a missing value as 1.
		quantity?: number;
		availableQty?: number;
		// Optional so older publishers/consumers stay compatible.
		eventDate?: string;
		venue?: string;
		description?: string;
		category?: string;
		imageUrl?: string;
		unlisted?: boolean;
	};
}
