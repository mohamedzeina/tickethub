// One definition of "the same email address".
//
// The domain part of an address is case-insensitive per RFC 5321, and no mail
// provider anyone signs up with treats the local part as case-sensitive either —
// so users reasonably expect Alice@Example.com and alice@example.com to be one
// account. Storage and lookup used to be case-SENSITIVE while the rate-limit key
// was case-INSENSITIVE, which meant the two disagreed: casing created a second
// account that the duplicate-signup check missed, yet shared one limiter budget
// with the first.
//
// Deliberately NOT express-validator's normalizeEmail(): that also strips dots
// and +subaddresses for known providers, which silently merges addresses the
// user considers distinct.
export const normalizeEmail = (email: unknown): string | undefined =>
	typeof email === 'string' ? email.trim().toLowerCase() : undefined;
