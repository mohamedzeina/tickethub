// Mock just sendMail; keep the rest of common real (events, OrderStatus, …).
jest.mock('@zeina-tickethub/common', () => ({
	...jest.requireActual('@zeina-tickethub/common'),
	sendMail: jest.fn(),
}));

import { PaymentCreatedEvent, OrderStatus, sendMail } from '@zeina-tickethub/common';
import { PaymentCreatedListener } from '../payment-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import { Notification, NotificationType } from '../../../models/notification';
import { msg, oid, seedOrder } from '../../../test/helpers';

const seedUnpaidOrder = (userId: string, sellerId?: string, quantity = 1) =>
	seedOrder({
		userId,
		status: OrderStatus.Created,
		userEmail: 'buyer@test.com',
		price: 20,
		quantity,
		sellerId,
	});

it('marks the replica paid, notifies, and emails a receipt', async () => {
	const listener = new PaymentCreatedListener(natsWrapper.connection);
	const userId = oid();
	const order = await seedUnpaidOrder(userId);

	const data: PaymentCreatedEvent['data'] = {
		id: oid(),
		orderId: order.id,
		stripeId: 'pi_123',
	};
	const m = msg(1);

	await listener.onMessage(data, m);

	const updated = await Order.findById(order.id);
	expect(updated!.status).toEqual(OrderStatus.Complete);

	const notifications = await Notification.find({ userId });
	expect(notifications.length).toEqual(1);
	expect(notifications[0].type).toEqual(NotificationType.PaymentSucceeded);

	expect(sendMail).toHaveBeenCalledTimes(1);
	const mail = (sendMail as jest.Mock).mock.calls[0][0];
	expect(mail.to).toEqual('buyer@test.com');
	expect(mail.subject).toContain('receipt');

	expect(m.ack).toHaveBeenCalled();
});

it('throws (for retry) when the order replica is not yet present', async () => {
	const listener = new PaymentCreatedListener(natsWrapper.connection);
	const data: PaymentCreatedEvent['data'] = {
		id: oid(),
		orderId: oid(),
		stripeId: 'pi_123',
	};
	const m = msg(1);

	await expect(listener.onMessage(data, m)).rejects.toThrow('Order not found');
	expect(m.ack).not.toHaveBeenCalled();
	expect(sendMail).not.toHaveBeenCalled();
});

it('also notifies the SELLER that their ticket sold (#11)', async () => {
	const listener = new PaymentCreatedListener(natsWrapper.connection);
	const buyerId = oid();
	const sellerId = oid();
	const order = await seedUnpaidOrder(buyerId, sellerId);

	await listener.onMessage(
		{ id: 'evt', orderId: order.id, stripeId: 'pi_1' } as PaymentCreatedEvent['data'],
		msg(1),
	);

	const sellerNotes = await Notification.find({ userId: sellerId });
	expect(sellerNotes.length).toEqual(1);
	expect(sellerNotes[0].type).toEqual(NotificationType.TicketSold);
	expect(sellerNotes[0].body).toContain('€20.00');
});

it('reflects the seat count and total in the receipt + seller note (#10)', async () => {
	const listener = new PaymentCreatedListener(natsWrapper.connection);
	const buyerId = oid();
	const sellerId = oid();
	// 3 seats × €20 = €60
	const order = await seedUnpaidOrder(buyerId, sellerId, 3);

	await listener.onMessage(
		{ id: 'evt', orderId: order.id, stripeId: 'pi_1' } as PaymentCreatedEvent['data'],
		msg(1),
	);

	// Seller note shows the seat count and the order total, not the per-seat price.
	const sellerNotes = await Notification.find({ userId: sellerId });
	expect(sellerNotes[0].body).toContain('3 seats');
	expect(sellerNotes[0].body).toContain('€60.00');

	// Receipt email totals to €60 and itemises the seats.
	const mail = (sendMail as jest.Mock).mock.calls[0][0];
	expect(mail.text).toContain('€60.00');
	expect(mail.text).toContain('3 ×');
});

it('does not duplicate the buyer note when a redelivery replays a half-applied event', async () => {
	const listener = new PaymentCreatedListener(natsWrapper.connection);
	const buyerId = oid();
	const sellerId = oid();
	const order = await seedUnpaidOrder(buyerId, sellerId);

	// The sparse unique index on dedupeKey is what collapses the replay; build
	// it up front rather than relying on mongoose's background autoIndex.
	await Notification.init();

	const data: PaymentCreatedEvent['data'] = {
		id: oid(),
		orderId: order.id,
		stripeId: 'pi_1',
	};

	// Fail the SECOND notification write (the seller's) once. The buyer's row is
	// already committed by then, and the throw means processOnce never marks the
	// event handled — exactly the state JetStream redelivers into.
	const realSave = Notification.prototype.save;
	let writes = 0;
	const save = jest
		.spyOn(Notification.prototype, 'save')
		.mockImplementation(function (this: any, ...args: any[]) {
			writes += 1;
			return writes === 2
				? Promise.reject(new Error('write failed'))
				: realSave.apply(this, args);
		} as any);

	await expect(listener.onMessage(data, msg(7))).rejects.toThrow('write failed');
	save.mockRestore();

	// Same message, same sequence: the redelivery.
	const redelivery = msg(7);
	await listener.onMessage(data, redelivery);

	const buyerNotes = await Notification.find({
		userId: buyerId,
		type: NotificationType.PaymentSucceeded,
	});
	expect(buyerNotes.length).toEqual(1);

	// The seller's write, which never landed, still gets its own row — the key
	// is per recipient, so it doesn't collide with the buyer's.
	const sellerNotes = await Notification.find({ userId: sellerId });
	expect(sellerNotes.length).toEqual(1);
	expect(sellerNotes[0].type).toEqual(NotificationType.TicketSold);

	expect(redelivery.ack).toHaveBeenCalled();
});
