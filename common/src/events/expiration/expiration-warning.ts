import { Subjects } from '../subjects';

// Fired by the expiration service a configurable lead time *before* a hold
// actually expires. orders decides whether to act on it (only an still-unpaid
// order gets a "your hold expires soon" email). (#5b)
export interface ExpirationWarningEvent {
	subject: Subjects.ExpirationWarning;
	data: {
		orderId: string;
	};
}
