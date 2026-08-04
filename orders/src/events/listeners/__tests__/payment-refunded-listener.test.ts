import { OrderStatus, PaymentRefundedEvent } from '@zeina-tickethub/common';
import { PaymentRefundedListener } from '../payment-refunded-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import { oid, fakeMsg as msg, buildPaidOrder } from '../../../test/factories';

it('flips the order to Refunded with metadata and releases the ticket', async () => {
	const order = await buildPaidOrder();
	const listener = new PaymentRefundedListener(natsWrapper.connection);
	const data: PaymentRefundedEvent['data'] = {
		id: 'pay_1',
		orderId: order.id,
		stripeId: 'pi_1',
		amount: 50,
		refundId: 're_1',
	};
	const m = msg(1);

	await listener.onMessage(data, m);

	const updated = await Order.findById(order.id);
	expect(updated!.status).toEqual(OrderStatus.Refunded);
	expect(updated!.refundedAt).toBeTruthy();
	expect(updated!.refundAmount).toEqual(50);
	expect(updated!.stripeRefundId).toEqual('re_1');
	// order:cancelled published to release the ticket + cascade.
	expect(natsWrapper.js.publish).toHaveBeenCalled();
	expect(m.ack).toHaveBeenCalled();
});

it('is a no-op when the order is already Refunded', async () => {
	const order = await buildPaidOrder({ status: OrderStatus.Refunded });
	const listener = new PaymentRefundedListener(natsWrapper.connection);
	await listener.onMessage(
		{ id: 'p', orderId: order.id, stripeId: 'pi_1' } as any,
		msg(1),
	);
	expect(natsWrapper.js.publish).not.toHaveBeenCalled();
});

it('throws (for retry) when the order replica is missing', async () => {
	const listener = new PaymentRefundedListener(natsWrapper.connection);
	const m = msg(1);
	await expect(
		listener.onMessage(
			{ id: 'p', orderId: oid(), stripeId: 'pi_1' } as any,
			m,
		),
	).rejects.toThrow('Order not found');
	expect(m.ack).not.toHaveBeenCalled();
});
