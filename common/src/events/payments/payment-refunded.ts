import { Subjects } from '../subjects';

// Published by payments after it refunds a cancelled-but-paid order's charge.
export interface PaymentRefundedEvent {
	subject: Subjects.PaymentRefunded;
	data: {
		id: string;
		orderId: string;
		stripeId: string;
	};
}
