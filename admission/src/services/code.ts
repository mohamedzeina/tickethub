import crypto from 'crypto';

// The admission-pass "code" is what the QR encodes and the gate scans. It is an
// HMAC-signed reference to a pass id: `<passId>.<sig>`. The signature makes the
// code unforgeable — a buyer can't fabricate a valid code for another order or a
// pass that doesn't exist. Validity (single-use / revoked) is still enforced by
// the Pass.status in the DB; the signature only proves authenticity.
//
// passId is a 24-char hex ObjectId (no '.'), so we split on the last '.'.

const signingSecret = (): string => {
	const secret = process.env.PASS_SIGNING_SECRET;
	if (!secret) {
		throw new Error('PASS_SIGNING_SECRET must be defined');
	}
	return secret;
};

const sign = (passId: string): string =>
	crypto.createHmac('sha256', signingSecret()).update(passId).digest('base64url');

// Encode a pass id into a signed gate code.
export const signPass = (passId: string): string => `${passId}.${sign(passId)}`;

// Verify a scanned code and return the pass id it authenticates, or null if the
// code is malformed or the signature doesn't match. Constant-time comparison.
export const verifyPass = (code: unknown): string | null => {
	if (typeof code !== 'string' || code.length === 0) {
		return null;
	}
	const dot = code.lastIndexOf('.');
	if (dot <= 0 || dot === code.length - 1) {
		return null;
	}
	const passId = code.slice(0, dot);
	const sig = code.slice(dot + 1);
	const expected = sign(passId);

	const a = Buffer.from(sig);
	const b = Buffer.from(expected);
	if (a.length !== b.length) {
		return null;
	}
	return crypto.timingSafeEqual(a, b) ? passId : null;
};
