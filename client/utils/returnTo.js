// Helpers for "sign in, then come back here" auth gating.
//
// `returnTo` is a user-influenced value (it rides in the URL), so it must be
// treated as untrusted: only a same-origin, root-relative path is ever honored.
// A protocol-relative `//evil.com`, a `/\evil.com` backslash trick, or an
// absolute `http://…` URL would be an open redirect, so those fall back to home.
// We also refuse `/auth/*` targets so a bounce can't loop back onto sign-in.

export const safeReturnTo = (value) => {
	if (typeof value !== 'string' || value.length === 0) return '/';
	if (!value.startsWith('/')) return '/'; // must be root-relative
	if (value.startsWith('//') || value.startsWith('/\\')) return '/'; // not protocol-relative
	if (value.startsWith('/auth/')) return '/'; // never bounce back onto auth
	return value;
};

// Build a sign-in link that remembers where the user was headed. Returns the
// bare `/auth/signin` when there's nothing meaningful to return to.
export const signInHref = (returnTo) => {
	const safe = safeReturnTo(returnTo);
	return safe === '/' ? '/auth/signin' : `/auth/signin?returnTo=${encodeURIComponent(safe)}`;
};

// Append a `returnTo` to any auth href (e.g. the sign-up link on the sign-in
// screen) so switching between sign-in and sign-up keeps the destination.
export const withReturnTo = (href, returnTo) => {
	const safe = safeReturnTo(returnTo);
	return safe === '/' ? href : `${href}?returnTo=${encodeURIComponent(safe)}`;
};
