// Pull the first message out of an API error response. Every service wraps its
// failures in the common `{ errors: [{ message }] }` shape, but a network blip
// or a non-JSON gateway error has no body at all — so each call site passes the
// human fallback it wants to show instead.
export const apiError = (err, fallback) =>
	err?.response?.data?.errors?.[0]?.message || fallback;
