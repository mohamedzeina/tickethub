import { Subjects } from '../subjects';

// Published by orders when a buyer requests a refund on a completed order (and
// it passes the refund-window check). Payments listens, creates the Stripe
// refund, and only announces success (PaymentRefunded) once Stripe's webhook
// confirms the money actually moved. `id` is the orderId.
export interface OrderRefundRequestedEvent {
	subject: Subjects.OrderRefundRequested;
	data: {
		id: string;
	};
}
