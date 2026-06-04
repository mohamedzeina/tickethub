import { Subjects } from '../subjects';

// Published by auth on signup (and resend). The raw token travels to the
// notifications service so it can build the verification link; auth persists
// only a hash of it with a TTL.
export interface UserVerificationRequestedEvent {
	subject: Subjects.UserVerificationRequested;
	data: {
		email: string;
		token: string;
	};
}
