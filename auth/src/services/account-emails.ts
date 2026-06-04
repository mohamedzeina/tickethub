import { natsWrapper } from '../nats-wrapper';
import { UserDoc } from '../models/user';
import {
	TokenManager,
	VERIFICATION_TTL_MS,
	PASSWORD_RESET_TTL_MS,
} from './tokens';
import { VerificationRequestedPublisher } from '../events/publishers/verification-requested-publisher';
import { PasswordResetRequestedPublisher } from '../events/publishers/password-reset-requested-publisher';

// Mint a fresh verification token, persist its hash + expiry on the user, and
// publish the request so notifications sends the email. Used by signup and
// resend. The raw token only ever lives in the event/email link.
export const issueVerification = async (user: UserDoc): Promise<void> => {
	const raw = TokenManager.generate();
	user.set({
		verificationToken: TokenManager.hash(raw),
		verificationTokenExpires: new Date(Date.now() + VERIFICATION_TTL_MS),
	});
	await user.save();

	await new VerificationRequestedPublisher(natsWrapper.js).publish({
		email: user.email,
		token: raw,
	});
};

// Same shape for password reset: store a hashed, short-lived token and publish.
export const issuePasswordReset = async (user: UserDoc): Promise<void> => {
	const raw = TokenManager.generate();
	user.set({
		passwordResetToken: TokenManager.hash(raw),
		passwordResetExpires: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
	});
	await user.save();

	await new PasswordResetRequestedPublisher(natsWrapper.js).publish({
		email: user.email,
		token: raw,
	});
};
