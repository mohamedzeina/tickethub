import { Subjects } from '../subjects';

// Published by payments once Stripe's webhook CONFIRMS a refund settled (#6
// tail) — not on the optimistic refunds.create() return. `amount`/`refundId`
// carry the confirmed figures for the receipt + records; both optional so a
// replay of an older event still validates.
export interface PaymentRefundedEvent {
	subject: Subjects.PaymentRefunded;
	data: {
		id: string;
		orderId: string;
		stripeId: string;
		amount?: number; // dollars
		refundId?: string; // Stripe refund id (re_...)
	};
}
