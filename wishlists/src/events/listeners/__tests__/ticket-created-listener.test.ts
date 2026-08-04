import {
	TicketCreatedEvent,
	TicketUpdatedEvent,
	Subjects,
} from '@zeina-tickethub/common';
import { TicketCreatedListener } from '../ticket-created-listener';
import { TicketUpdatedListener } from '../ticket-updated-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { TicketRef } from '../../../models/ticket-ref';
import { id, msg, seedWatchers } from '../../../test/factories';

it('seeds a sold-out listing as unavailable so a later restock still alerts', async () => {
	const ticketId = id();
	const sellerId = id();
	await seedWatchers(ticketId, 1);

	// A listing whose seats are all spoken for by the time create lands.
	const created: TicketCreatedEvent['data'] = {
		id: ticketId,
		version: 0,
		title: 'Coldplay',
		price: 100,
		userId: sellerId,
		quantity: 2,
		availableQty: 0,
	};
	await new TicketCreatedListener(natsWrapper.connection).onMessage(
		created,
		msg(1),
	);

	const ref = await TicketRef.findById(ticketId);
	expect(ref!.available).toBe(false);

	// A seat comes back. Only a false→true transition fires the alert, so this
	// is exactly what the seeding bug used to swallow.
	const updated: TicketUpdatedEvent['data'] = {
		id: ticketId,
		version: 1,
		title: 'Coldplay',
		price: 100,
		userId: sellerId,
		quantity: 2,
		availableQty: 1,
	};
	await new TicketUpdatedListener(natsWrapper.connection).onMessage(
		updated,
		msg(2),
	);

	const calls = (natsWrapper.js.publish as jest.Mock).mock.calls.filter(
		(c: any[]) => c[0] === Subjects.WishlistAvailable,
	);
	expect(calls.length).toBe(1);
});
