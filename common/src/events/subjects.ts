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
}
