import { Subjects } from '../subjects';

// Published by auth when a user requests a password reset. The raw token is
// carried so notifications can build the reset link; auth stores only a hash
// with a short TTL.
export interface PasswordResetRequestedEvent {
	subject: Subjects.PasswordResetRequested;
	data: {
		email: string;
		token: string;
	};
}
