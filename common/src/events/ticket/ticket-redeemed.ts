import { Subjects } from '../subjects';

// Published by the admission service when an admission pass is scanned and
// redeemed at the gate. Lets notifications confirm check-in and lets orders
// mark the order used (a redeemed ticket can no longer be refunded).
export interface TicketRedeemedEvent {
	subject: Subjects.TicketRedeemed;
	data: {
		passId: string;
		orderId: string;
		ticketId: string;
		buyerId: string;
		redeemedAt: string;
	};
}
