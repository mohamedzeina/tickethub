import { Subjects } from '../subjects';

// Published by payments when a PaymentIntent is created for an order, before the
// card is confirmed. orders uses it to move the order into AwaitingPayment.
export interface PaymentInitiatedEvent {
	subject: Subjects.PaymentInitiated;
	data: {
		orderId: string;
	};
}
