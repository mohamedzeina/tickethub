import { TicketRedeemedEvent } from '@zeina-tickethub/common';
import { TicketRedeemedListener } from '../ticket-redeemed-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import { oid, fakeMsg as msg, buildPaidOrder } from '../../../test/factories';

it('stamps redeemedAt so the order can no longer be refunded', async () => {
	const order = await buildPaidOrder();
	const listener = new TicketRedeemedListener(natsWrapper.connection);
	const data: TicketRedeemedEvent['data'] = {
		passId: 'pass_1',
		orderId: order.id,
		ticketId: order.ticket.id,
		buyerId: order.userId,
		redeemedAt: new Date().toISOString(),
	};
	const m = msg(1);

	await listener.onMessage(data, m);

	const updated = await Order.findById(order.id);
	expect(updated!.redeemedAt).toBeTruthy();
	expect(m.ack).toHaveBeenCalled();
});

it('is a no-op for an unknown order', async () => {
	const listener = new TicketRedeemedListener(natsWrapper.connection);
	const m = msg(1);
	await listener.onMessage(
		{
			passId: 'p',
			orderId: oid(),
			ticketId: 't',
			buyerId: 'b',
			redeemedAt: new Date().toISOString(),
		} as any,
		m,
	);
	expect(m.ack).toHaveBeenCalled();
});
