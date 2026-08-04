import crypto from 'crypto';

import { User, UserDoc } from '../models/user';

// Single-use tokens for email verification and password reset. The raw token is
// emailed to the user; only its hash is stored, so a leaked database can't be
// used to verify/reset accounts. High-entropy random → a fast sha256 hash is
// enough (no need for bcrypt's work factor as with passwords).
export class TokenManager {
	static generate(): string {
		return crypto.randomBytes(32).toString('hex');
	}

	static hash(raw: string): string {
		return crypto.createHash('sha256').update(raw).digest('hex');
	}
}

// TTLs.
export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h

// Field pairs a single-use token lives on. Kept together so the token and its
// expiry can never be looked up out of step with each other.
export type TokenField = 'verificationToken' | 'passwordResetToken';
export type TokenExpiresField =
	| 'verificationTokenExpires'
	| 'passwordResetExpires';

// Find the user holding a raw single-use token: we store only the hash, so look
// up by hashing the presented token, and require the expiry to still be in the
// future. Returns null when there's no match — callers throw their own message.
export const findByToken = async (
	tokenField: TokenField,
	expiresField: TokenExpiresField,
	rawToken: string,
): Promise<UserDoc | null> => {
	return User.findOne({
		[tokenField]: TokenManager.hash(rawToken),
		[expiresField]: { $gt: new Date() },
	});
};
