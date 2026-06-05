import { Subjects } from '../subjects';

// #11 payouts. Emitted by the orders service (once per order) when a Complete,
// non-refunded order passes its refund window — the moment it becomes safe to
// pay the seller, since by construction no refund can follow. payments turns this
// into a Stripe transfer of (amount − platform fee) to the seller's connected
// account, or holds it if the seller hasn't connected yet.
export interface OrderPayoutDueEvent {
	subject: Subjects.OrderPayoutDue;
	data: {
		orderId: string;
		// The seller (ticket owner) to be paid — a user id (cross-service String).
		sellerId: string;
		// Gross sale price in dollars; payments deducts the platform fee.
		amount: number;
	};
}
