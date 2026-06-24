import { Subjects } from '../subjects';
import { OrderStatus } from '../types/order-status';

export interface OrderCreatedEvent {
	subject: Subjects.OrderCreated;
	data: {
		id: string;
		version: number;
		status: OrderStatus;
		userId: string;
		// Buyer's email, carried so downstream services (payments receipt,
		// expiration warnings) can notify without a separate user lookup. (#5)
		userEmail: string;
		expiresAt: string;
		// The seller (ticket owner), so downstream services can notify the seller
		// when their ticket sells / is refunded (#11). Optional — replays of
		// pre-#11 events stay valid.
		sellerId?: string;
		// Multi-seat (#10): how many seats this order reserves. The order total is
		// ticket.price * quantity. Optional so pre-#10 orders replay as 1 seat.
		quantity?: number;
		ticket: {
			id: string;
			// Per-seat face value. Multiply by `quantity` for the order total.
			price: number;
			title: string;
		};
	};
}
