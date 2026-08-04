import { PayoutProcessedEvent } from '@zeina-tickethub/common';
import { PayoutProcessedListener } from '../payout-processed-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Notification, NotificationType } from '../../../models/notification';
import { msg, oid, seedOrder } from '../../../test/helpers';

const deliver = (data: PayoutProcessedEvent['data'], seq: number) =>
	new PayoutProcessedListener(natsWrapper.connection).onMessage(data, msg(seq));

it('notifies the seller their payout was PAID, with the ticket + net amount', async () => {
	const order = await seedOrder();
	const sellerId = oid();

	await deliver({ orderId: order.id, sellerId, net: 90, status: 'paid' }, 1);

	const notes = await Notification.find({ userId: sellerId });
	expect(notes.length).toEqual(1);
	expect(notes[0].type).toEqual(NotificationType.PayoutPaid);
	expect(notes[0].body).toContain('€90.00');
	expect(notes[0].body).toContain('Akon Concert');
});

it('notifies the seller their earnings are HELD', async () => {
	const order = await seedOrder();
	const sellerId = oid();

	await deliver({ orderId: order.id, sellerId, net: 45, status: 'held' }, 1);

	const notes = await Notification.find({ userId: sellerId });
	expect(notes.length).toEqual(1);
	expect(notes[0].type).toEqual(NotificationType.PayoutHeld);
	expect(notes[0].body).toContain('€45.00');
});
