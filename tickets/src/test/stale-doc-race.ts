import { Ticket } from '../models/ticket';

// Reproduce the reserve-mid-write race precisely: the route loads the ticket
// (fully available, so its guard passes), but before its save runs a buyer
// reserves the ticket — dropping availableQty and advancing the version. We
// inject that by stubbing only the *first* findById to return a now-stale
// document while concurrently bumping the DB. The route's later save then
// version-conflicts. Returns the spy so the caller can mockRestore() it.
export const injectStaleDocRace = () => {
	const realFindById = (Ticket.findById as any).bind(Ticket);
	let injected = false;
	return jest.spyOn(Ticket, 'findById').mockImplementation(((
		ticketId: any,
	) => {
		if (injected) {
			return realFindById(ticketId);
		}
		injected = true;
		return (async () => {
			const stale = await realFindById(ticketId);
			const concurrent = await realFindById(ticketId);
			concurrent!.set({ availableQty: 0 });
			await concurrent!.save(); // advances the DB version
			return stale; // still holds the pre-reservation version
		})();
	}) as any);
};
