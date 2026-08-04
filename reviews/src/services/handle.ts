// Public-facing pseudonym for a user. Accounts only have an email today (no
// username), and we don't want to expose it, so reviews show a stable, opaque
// handle derived from the user id — e.g. "Seller A1B2" / "Buyer 7F3C". Same id
// always yields the same handle; it reveals nothing about the real identity.

// The guards are belt-and-braces: ids reaching here are 24-hex Mongo ids, so
// they are never empty and always leave 4 characters — but these values go
// straight into a user-visible string, so a malformed/short id degrades to a
// padded handle instead of something like "Seller ".
const tail = (id: string) => {
	const alphanumeric = (id || '').replace(/[^a-z0-9]/gi, '');
	const last4 = alphanumeric.slice(-4);
	return last4.toUpperCase().padStart(4, '0');
};

export const sellerHandle = (id: string) => `Seller ${tail(id)}`;
export const buyerHandle = (id: string) => `Buyer ${tail(id)}`;
