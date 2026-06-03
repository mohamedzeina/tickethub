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
		ticket: {
			id: string;
			price: number;
			title: string;
		};
	};
}
