// Mock just sendMail; keep the rest of common real (events, OrderStatus, …).
jest.mock('@zeina-tickethub/common', () => ({
	...jest.requireActual('@zeina-tickethub/common'),
	sendMail: jest.fn(),
}));

import { PaymentRefundedEvent, sendMail } from '@zeina-tickethub/common';
import { PaymentRefundedListener } from '../payment-refunded-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Notification, NotificationType } from '../../../models/notification';
import { msg, oid, seedOrder } from '../../../test/helpers';

it('notifies the buyer and emails a refund confirmation', async () => {
	const listener = new PaymentRefundedListener(natsWrapper.connection);
	const userId = oid();
	const order = await seedOrder({ userId, userEmail: 'buyer@test.com', price: 20 });

	const data: PaymentRefundedEvent['data'] = {
		id: oid(),
		orderId: order.id,
		stripeId: 'pi_123',
	};
	const m = msg(1);

	await listener.onMessage(data, m);

	const notifications = await Notification.find({ userId });
	expect(notifications.length).toEqual(1);
	expect(notifications[0].type).toEqual(NotificationType.PaymentRefunded);

	expect(sendMail).toHaveBeenCalledTimes(1);
	const mail = (sendMail as jest.Mock).mock.calls[0][0];
	expect(mail.to).toEqual('buyer@test.com');
	expect(mail.subject).toContain('refund');

	expect(m.ack).toHaveBeenCalled();
});

it('still notifies but skips email when no buyer email is on the replica', async () => {
	const listener = new PaymentRefundedListener(natsWrapper.connection);
	const userId = oid();
	const order = await seedOrder({ userId, price: 20 });

	const data: PaymentRefundedEvent['data'] = {
		id: oid(),
		orderId: order.id,
		stripeId: 'pi_123',
	};
	const m = msg(2);

	await listener.onMessage(data, m);

	const notifications = await Notification.find({ userId });
	expect(notifications.length).toEqual(1);
	expect(sendMail).not.toHaveBeenCalled();
	expect(m.ack).toHaveBeenCalled();
});

it('throws (for retry) when the order replica is not yet present', async () => {
	const listener = new PaymentRefundedListener(natsWrapper.connection);
	const data: PaymentRefundedEvent['data'] = {
		id: oid(),
		orderId: oid(),
		stripeId: 'pi_123',
	};
	const m = msg(3);

	await expect(listener.onMessage(data, m)).rejects.toThrow('Order not found');
	expect(m.ack).not.toHaveBeenCalled();
	expect(sendMail).not.toHaveBeenCalled();
});
