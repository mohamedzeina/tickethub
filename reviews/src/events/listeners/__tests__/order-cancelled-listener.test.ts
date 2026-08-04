import { OrderCancelledEvent, OrderStatus } from '@zeina-tickethub/common';
import { OrderCancelledListener } from '../order-cancelled-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { OrderRef } from '../../../models/order-ref';
import { Review } from '../../../models/review';
import { id, msg, seedOrder, seedReview } from '../../../test/factories';

const seed = async () => {
	const orderId = id();
	const sellerId = id();
	const buyerId = id();
	await seedOrder({
		id: orderId,
		buyerId,
		sellerId,
		ticketId: 't',
		ticketTitle: 'Akon',
		status: OrderStatus.Complete,
	});
	await seedReview({ orderId, sellerId, buyerId, ticketTitle: 'Akon', rating: 5 });
	return { orderId, sellerId, buyerId };
};

it("soft-hides the refunded order's review and excludes it from the seller aggregate", async () => {
	const { orderId, sellerId } = await seed();
	const listener = new OrderCancelledListener(natsWrapper.connection);
	const data: OrderCancelledEvent['data'] = { id: orderId, version: 1, ticket: { id: 't' } };

	await listener.onMessage(data, msg(1));

	const review = await Review.findOne({ orderId });
	expect(review!.hidden).toBe(true);

	const visible = await Review.find({ sellerId, hidden: { $ne: true } });
	expect(visible.length).toBe(0);

	const order = await OrderRef.findById(orderId);
	expect(order!.status).toEqual(OrderStatus.Cancelled);
});

it('is a no-op when the cancelled order has no review', async () => {
	const orderId = id();
	await seedOrder({
		id: orderId,
		buyerId: 'b',
		sellerId: 's',
		ticketId: 't',
		ticketTitle: 'X',
		status: OrderStatus.Complete,
	});
	const listener = new OrderCancelledListener(natsWrapper.connection);

	await listener.onMessage({ id: orderId, version: 1, ticket: { id: 't' } } as any, msg(1));

	const order = await OrderRef.findById(orderId);
	expect(order!.status).toEqual(OrderStatus.Cancelled);
});
