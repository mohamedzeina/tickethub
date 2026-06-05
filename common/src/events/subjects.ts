export enum Subjects {
	TicketCreated = 'ticket:created',
	TicketUpdated = 'ticket:updated',
	// A buyer's admission pass was scanned at the gate (admission service). Marks
	// the order as used → notifications + makes it non-refundable.
	TicketRedeemed = 'ticket:redeemed',

	OrderCreated = 'order:created',
	OrderCancelled = 'order:cancelled',
	// A buyer asked to refund a completed order (#6 tail). Payments attempts the
	// Stripe refund; the actual money-moved confirmation comes back as
	// PaymentRefunded once Stripe's webhook fires.
	OrderRefundRequested = 'order:refund:requested',
	// An order has passed its refund window (#11 payouts). Orders emits this once
	// per order so payments can transfer the seller's share (sale − platform fee)
	// to their connected Stripe account, or hold it until they connect.
	OrderPayoutDue = 'order:payout:due',
	// A seller's payout reached a terminal state (paid / held). payments emits it
	// so notifications can tell the seller (#11).
	PayoutProcessed = 'payout:processed',

	ExpirationComplete = 'expiration:complete',
	ExpirationWarning = 'expiration:warning',

	PaymentInitiated = 'payment:initiated',
	PaymentCreated = 'payment:created',
	PaymentRefunded = 'payment:refunded',

	// Account hardening (#7). Carry a raw token so notifications can build the
	// email link; auth stores only a hash of it.
	UserVerificationRequested = 'user:verification:requested',
	PasswordResetRequested = 'password:reset:requested',
}
