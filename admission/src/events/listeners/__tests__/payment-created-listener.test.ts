import { PaymentCreatedEvent, OrderStatus } from '@zeina-tickethub/common';
import { PaymentCreatedListener } from '../payment-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { OrderRef } from '../../../models/order-ref';
import { TicketRef } from '../../../models/ticket-ref';
import { Pass } from '../../../models/pass';
import { oid, msg } from '../../../test/helpers';

const seed = async (quantity = 1) => {
	const ticketId = oid();
	const buyerId = oid();
	const orderId = oid();
	await OrderRef.build({
		id: orderId,
		buyerId,
		ticketId,
		ticketTitle: 'Coldplay',
		status: OrderStatus.Created,
		quantity,
	}).save();
	await TicketRef.build({
		id: ticketId,
		title: 'Coldplay',
		venue: 'Wembley',
		eventDate: new Date(),
	}).save();
	return { orderId, buyerId, ticketId };
};

it('mints an issued pass and completes the order replica', async () => {
	const { orderId, buyerId } = await seed();
	const listener = new PaymentCreatedListener(natsWrapper.connection);
	const data: PaymentCreatedEvent['data'] = {
		id: oid(),
		orderId,
		stripeId: 'pi_1',
	};
	const m = msg(1);

	await listener.onMessage(data, m);

	const pass = await Pass.findOne({ orderId });
	expect(pass).not.toBeNull();
	expect(pass!.status).toBe('issued');
	expect(pass!.buyerId).toBe(buyerId);
	expect(pass!.venue).toBe('Wembley');

	const order = await OrderRef.findById(orderId);
	expect(order!.status).toBe(OrderStatus.Complete);
	expect(m.ack).toHaveBeenCalled();
});

it('mints one pass per seat for a multi-seat order (#10)', async () => {
	const { orderId, buyerId } = await seed(3);
	const listener = new PaymentCreatedListener(natsWrapper.connection);
	const data: any = { id: 'p', orderId, stripeId: 'pi_1' };

	await listener.onMessage(data, msg(1));

	const passes = await Pass.find({ orderId }).sort({ seat: 1 });
	expect(passes).toHaveLength(3);
	expect(passes.map((p) => p.seat)).toEqual([1, 2, 3]);
	expect(passes.every((p) => p.status === 'issued')).toBe(true);
	expect(passes.every((p) => p.buyerId === buyerId)).toBe(true);
});

it('is idempotent — a redelivery mints no duplicate passes', async () => {
	const { orderId } = await seed(3);
	const listener = new PaymentCreatedListener(natsWrapper.connection);
	const data: any = { id: 'p', orderId, stripeId: 'pi_1' };

	await listener.onMessage(data, msg(1));
	await listener.onMessage(data, msg(2)); // distinct seq, same order

	expect(await Pass.countDocuments({ orderId })).toBe(3);
});

it('throws (for retry) when the order replica is missing', async () => {
	const listener = new PaymentCreatedListener(natsWrapper.connection);
	const data: any = {
		id: 'p',
		orderId: oid(),
		stripeId: 'pi_1',
	};
	const m = msg(1);

	await expect(listener.onMessage(data, m)).rejects.toThrow('OrderRef not found');
	expect(m.ack).not.toHaveBeenCalled();
});
