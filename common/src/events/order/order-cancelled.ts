import { Subjects } from '../subjects';

export interface OrderCancelledEvent {
	subject: Subjects.OrderCancelled;
	data: {
		id: string;
		version: number;
		// Multi-seat (#10): seats to release back to the listing's availableQty.
		// Optional so pre-#10 cancellations release 1 seat.
		quantity?: number;
		ticket: {
			id: string;
		};
	};
}
