// Formatting + display helpers shared across the "Admit One" ticket UI.

// EUR — the platform's Stripe account settles in euros (see payments STRIPE_KEY /
// CURRENCY). en-IE keeps the familiar "€300.00" layout (symbol first, dot decimals).
export const formatPrice = (price) =>
	new Intl.NumberFormat('en-IE', {
		style: 'currency',
		currency: 'EUR',
	}).format(Number(price) || 0);

// Event dates are a calendar day, not a wall-clock instant — they must not
// shift by the viewer's timezone (which would also mismatch SSR vs client and
// trip a hydration error). Pin to UTC so every viewer sees the same day.
export const formatDateShort = (value) =>
	value
		? new Intl.DateTimeFormat('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				timeZone: 'UTC',
		  }).format(new Date(value))
		: null;

export const formatDateLong = (value) =>
	value
		? new Intl.DateTimeFormat('en-US', {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
				year: 'numeric',
				timeZone: 'UTC',
		  }).format(new Date(value))
		: null;

// A real ticket needs a serial number. We derive a stable, printed-looking one
// from the Mongo id so it never changes between renders.
export const serialFromId = (id) =>
	id ? id.slice(-5).toUpperCase() : '00000';

// The opaque seller pseudonym, mirroring the reviews service's `sellerHandle`
// (a pure function of the id — "Seller A1B2"). Used as the fallback on listing
// cards when a seller hasn't set a display name (#18), so we can label who's
// selling without an extra round trip.
export const sellerHandle = (id) =>
	`Seller ${(id || '').replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase().padStart(4, '0')}`;

// A longer faux barcode number, also derived from the id for stability.
export const barcodeNumber = (id) => {
	const s = (id || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
	const block = (start, len) => (s.slice(start, start + len) || '0').padEnd(len, '0');
	return `${block(0, 1)} ${block(1, 5)} ${block(6, 5)} ${block(11, 1)}`;
};
