import { JetStreamClient } from 'nats';

import { natsWrapper } from '../nats-wrapper';
import { UserDoc } from '../models/user';
import {
	TokenManager,
	TokenField,
	TokenExpiresField,
	VERIFICATION_TTL_MS,
	PASSWORD_RESET_TTL_MS,
} from './tokens';
import { VerificationRequestedPublisher } from '../events/publishers/verification-requested-publisher';
import { PasswordResetRequestedPublisher } from '../events/publishers/password-reset-requested-publisher';

// Anything that can publish an { email, token } request for notifications.
interface TokenPublisher {
	publish(data: { email: string; token: string }): Promise<void>;
}

interface IssueTokenOptions {
	tokenField: TokenField;
	expiresField: TokenExpiresField;
	ttlMs: number;
	Publisher: new (js: JetStreamClient) => TokenPublisher;
}

// Mint a fresh token, persist its hash + expiry on the user, and publish the
// request so notifications sends the email. The raw token only ever lives in
// the event/email link — the DB keeps just the hash.
const issueToken = async (
	user: UserDoc,
	{ tokenField, expiresField, ttlMs, Publisher }: IssueTokenOptions,
): Promise<void> => {
	const raw = TokenManager.generate();
	user.set({
		[tokenField]: TokenManager.hash(raw),
		[expiresField]: new Date(Date.now() + ttlMs),
	});
	await user.save();

	await new Publisher(natsWrapper.js).publish({
		email: user.email,
		token: raw,
	});
};

// Verification email. Used by signup and resend; new accounts start unverified.
export const issueVerification = (user: UserDoc): Promise<void> =>
	issueToken(user, {
		tokenField: 'verificationToken',
		expiresField: 'verificationTokenExpires',
		ttlMs: VERIFICATION_TTL_MS,
		Publisher: VerificationRequestedPublisher,
	});

// Same shape for password reset: a hashed, shorter-lived token.
export const issuePasswordReset = (user: UserDoc): Promise<void> =>
	issueToken(user, {
		tokenField: 'passwordResetToken',
		expiresField: 'passwordResetExpires',
		ttlMs: PASSWORD_RESET_TTL_MS,
		Publisher: PasswordResetRequestedPublisher,
	});
