// Buyable right now = listed AND at least one seat free. Multi-seat (#10): use
// availableQty as the signal; a partially-sold listing (availableQty > 0) is
// still buyable. Fall back to the legacy orderId for pre-#10 event replays.
//
// Shared by the created- and updated-listeners on purpose: if create seeded
// `available` a different way, a listing born sold-out would be stored as
// available and the first genuine restock would look like true→true, so the
// "back on sale" alert could never fire.
export const isAvailable = (data: {
	unlisted?: boolean;
	availableQty?: number;
	orderId?: string;
}) => {
	const seatsLeft = data.availableQty ?? (data.orderId ? 0 : 1);
	return !(data.unlisted ?? false) && seatsLeft > 0;
};
