import { TicketDoc } from '../models/ticket';

// The one definition of what a ticket:created / ticket:updated event carries.
//
// Consumers (orders, payments, wishlists) rebuild their whole replica from this
// payload — orders literally does `ticket.set({ ...fields })` — so a field left
// out here is a field UNSET over there, not a field left alone. That is exactly
// how reserving a ticket used to wipe eventDate on the orders replica (and with
// it the refund window's event cutoff), and how editing a hidden listing used to
// clear `unlisted` and quietly put it back on sale.
//
// So: every replicated field, on every publish, from every call site. Add a new
// replicated field to the ticket model and it belongs here too.
export const ticketEventPayload = (ticket: TicketDoc) => ({
	id: ticket.id,
	version: ticket.version,
	title: ticket.title,
	price: ticket.price,
	quantity: ticket.quantity,
	availableQty: ticket.availableQty,
	userId: ticket.userId,
	eventDate: ticket.eventDate?.toISOString(),
	venue: ticket.venue,
	description: ticket.description,
	category: ticket.category,
	imageUrl: ticket.imageUrl,
	unlisted: ticket.unlisted,
});
