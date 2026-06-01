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
		// Optional so older publishers/consumers stay compatible.
		eventDate?: string;
		venue?: string;
		description?: string;
		category?: string;
		imageUrl?: string;
	};
}
