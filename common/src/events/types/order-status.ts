export enum OrderStatus {
	// When the order has been created, but the ticket it is trying to
	// order has not been reserved
	Created = 'created',

	// The ticket the order is trying to reserve has already been reserved,
	// or when the user has cancelled the order
	// The order expires before payment
	Cancelled = 'cancelled',

	// The order has successfully reserved the ticket
	AwaitingPayment = 'awaiting:payment',

	// The order has reserved the ticket and the user has provided payment successfully
	Complete = 'complete',

	// A completed order whose charge has been refunded (#6 tail). Distinct from
	// Cancelled (an unpaid hold that was released) so the receipt can show the
	// real "Refunded $X" state. Reached only after Stripe confirms the refund.
	Refunded = 'refunded',
}
