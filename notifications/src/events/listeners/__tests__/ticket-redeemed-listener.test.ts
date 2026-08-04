import { TicketRedeemedEvent } from '@zeina-tickethub/common';
import { TicketRedeemedListener } from '../ticket-redeemed-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Notification, NotificationType } from '../../../models/notification';
import { msg, oid, seedOrder } from '../../../test/helpers';

// Delivers the event and hands back that delivery's ack spy.
const deliver = async (data: TicketRedeemedEvent['data'], seq: number) => {
	const m = msg(seq);
	await new TicketRedeemedListener(natsWrapper.connection).onMessage(data, m);
	return m.ack;
};

const payload = (orderId: string, buyerId: string): TicketRedeemedEvent['data'] => ({
	passId: oid(),
	orderId,
	ticketId: oid(),
	buyerId,
	redeemedAt: new Date().toISOString(),
});

it('notifies the buyer their pass was scanned, with the ticket title', async () => {
	const buyerId = oid();
	const order = await seedOrder({ userId: buyerId });

	await deliver(payload(order.id, buyerId), 1);

	const notes = await Notification.find({ userId: buyerId });
	expect(notes.length).toEqual(1);
	expect(notes[0].type).toEqual(NotificationType.PassScanned);
	expect(notes[0].body).toContain('Akon Concert');
	expect(notes[0].orderId).toEqual(order.id);
});

it('falls back gracefully when the order replica is missing', async () => {
	const buyerId = oid();

	await deliver(payload(oid(), buyerId), 1);

	const notes = await Notification.find({ userId: buyerId });
	expect(notes.length).toEqual(1);
	expect(notes[0].type).toEqual(NotificationType.PassScanned);
	expect(notes[0].body).toContain('your event');
});

it('is idempotent on redelivery (same seq → one notification)', async () => {
	const buyerId = oid();
	const order = await seedOrder({ userId: buyerId });

	const ack1 = await deliver(payload(order.id, buyerId), 7);
	const ack2 = await deliver(payload(order.id, buyerId), 7);

	const notes = await Notification.find({ userId: buyerId });
	expect(notes.length).toEqual(1);
	expect(ack1).toHaveBeenCalled();
	expect(ack2).toHaveBeenCalled();
});
