export enum Subjects {
	TicketCreated = 'ticket:created',
	TicketUpdated = 'ticket:updated',

	OrderCreated = 'order:created',
	OrderCancelled = 'order:cancelled',

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
