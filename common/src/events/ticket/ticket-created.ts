import { Subjects } from '../subjects';

export interface TicketCreatedEvent {
	subject: Subjects.TicketCreated;
	data: {
		id: string;
		version: number;
		title: string;
		price: number;
		userId: string;
		// Optional so older publishers/consumers stay compatible.
		eventDate?: string;
		venue?: string;
		description?: string;
		category?: string;
		imageUrl?: string;
		unlisted?: boolean;
	};
}
