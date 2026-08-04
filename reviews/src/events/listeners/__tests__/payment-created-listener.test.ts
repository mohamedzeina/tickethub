import { PaymentCreatedEvent, OrderStatus } from '@zeina-tickethub/common';
import { PaymentCreatedListener } from '../payment-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { OrderRef } from '../../../models/order-ref';
import { id, msg, seedOrder } from '../../../test/factories';

it('marks the order complete so it becomes reviewable', async () => {
	const order = await seedOrder({ status: OrderStatus.Created });
	const listener = new PaymentCreatedListener(natsWrapper.connection);
	const data: PaymentCreatedEvent['data'] = {
		id: id(),
		orderId: order.id,
		stripeId: 'pi_123',
	};
	const message = msg(1);

	await listener.onMessage(data, message);

	const updated = await OrderRef.findById(order.id);
	expect(updated!.status).toEqual(OrderStatus.Complete);
	expect(message.ack).toHaveBeenCalled();
});

it('throws for retry when the order replica is not present yet', async () => {
	const listener = new PaymentCreatedListener(natsWrapper.connection);
	const data: PaymentCreatedEvent['data'] = {
		id: id(),
		orderId: id(),
		stripeId: 'pi_123',
	};
	const message = msg(1);

	await expect(listener.onMessage(data, message)).rejects.toThrow('OrderRef not found');
	expect(message.ack).not.toHaveBeenCalled();
});
