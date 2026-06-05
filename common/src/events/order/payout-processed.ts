import { Subjects } from '../subjects';

// #11 payouts. Emitted by payments once a seller's payout reaches a terminal
// state, so notifications can tell the seller. 'paid' = transferred to their
// account; 'held' = we're holding it until they connect a payout account.
// (Failed transfers don't emit — they retry silently.)
export interface PayoutProcessedEvent {
	subject: Subjects.PayoutProcessed;
	data: {
		orderId: string;
		sellerId: string;
		// Seller's net (sale − platform fee), in the settlement currency.
		net: number;
		status: 'paid' | 'held';
	};
}
