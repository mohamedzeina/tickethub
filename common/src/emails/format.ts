// Value formatting shared by the transactional emails. Internal to this
// package — not re-exported from index.ts, same as escape.ts and card.ts.

export const money = (n: number) =>
	new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n);

// Short human-quotable order reference. The full id is a 24-char ObjectId,
// which nobody can read back over the phone.
export const orderRef = (orderId: string) => orderId.slice(-6).toUpperCase();

export const longDate = (d: Date) =>
	d.toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
