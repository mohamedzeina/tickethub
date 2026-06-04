import crypto from 'crypto';

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
