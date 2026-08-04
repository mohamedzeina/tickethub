import { TicketRef } from '../../models/ticket-ref';

interface TicketRefFields {
	id: string;
	title: string;
	venue?: string;
	eventDate?: string;
}

// Shared body for the `ticket:created`/`ticket:updated` listeners — both seed the
// exact same read-model fields. Upsert (not insert) so replaying the shared
// persistent stream is safe whichever of the two lands first, and latest-wins on
// re-delivery (these fields are cosmetic).
export const upsertTicketRef = async (data: TicketRefFields) => {
	await TicketRef.findByIdAndUpdate(
		data.id,
		{ title: data.title, venue: data.venue, eventDate: data.eventDate },
		{ upsert: true },
	);
};
