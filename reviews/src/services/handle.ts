// Public-facing pseudonym for a user. Accounts only have an email today (no
// username), and we don't want to expose it, so reviews show a stable, opaque
// handle derived from the user id — e.g. "Seller A1B2" / "Buyer 7F3C". Same id
// always yields the same handle; it reveals nothing about the real identity.

const tail = (id: string) =>
	(id || '').replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase().padStart(4, '0');

export const sellerHandle = (id: string) => `Seller ${tail(id)}`;
export const buyerHandle = (id: string) => `Buyer ${tail(id)}`;
