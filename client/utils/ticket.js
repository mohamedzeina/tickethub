// Formatting + display helpers shared across the "Admit One" ticket UI.

export const formatPrice = (price) =>
	new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	}).format(Number(price) || 0);

export const formatDateShort = (value) =>
	value
		? new Intl.DateTimeFormat('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				year: 'numeric',
		  }).format(new Date(value))
		: null;

export const formatDateLong = (value) =>
	value
		? new Intl.DateTimeFormat('en-US', {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
				year: 'numeric',
		  }).format(new Date(value))
		: null;

// A real ticket needs a serial number. We derive a stable, printed-looking one
// from the Mongo id so it never changes between renders.
export const serialFromId = (id) =>
	id ? id.slice(-5).toUpperCase() : '00000';

// A longer faux barcode number, also derived from the id for stability.
export const barcodeNumber = (id) => {
	const s = (id || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
	const block = (start, len) => (s.slice(start, start + len) || '0').padEnd(len, '0');
	return `${block(0, 1)} ${block(1, 5)} ${block(6, 5)} ${block(11, 1)}`;
};
