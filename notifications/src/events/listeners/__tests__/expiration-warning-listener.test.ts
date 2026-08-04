jest.mock('@zeina-tickethub/common', () => ({
	...jest.requireActual('@zeina-tickethub/common'),
	sendMail: jest.fn(),
}));

import { ExpirationWarningEvent, OrderStatus, sendMail } from '@zeina-tickethub/common';
import { ExpirationWarningListener } from '../expiration-warning-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Notification, NotificationType } from '../../../models/notification';
import { msg, seedOrder } from '../../../test/helpers';

const setup = async (status: OrderStatus) => {
	const listener = new ExpirationWarningListener(natsWrapper.connection);

	const order = await seedOrder({
		status,
		userEmail: 'buyer@test.com',
		price: 20,
	});

	const data: ExpirationWarningEvent['data'] = { orderId: order.id };

	return { listener, data, msg: msg(1), userId: order.userId };
};

it('notifies + emails when the order is still unpaid (created)', async () => {
	const { listener, data, msg, userId } = await setup(OrderStatus.Created);
	await listener.onMessage(data, msg);

	const notifications = await Notification.find({ userId });
	expect(notifications.length).toEqual(1);
	expect(notifications[0].type).toEqual(NotificationType.HoldExpiring);
	expect(sendMail).toHaveBeenCalledTimes(1);
	expect((sendMail as jest.Mock).mock.calls[0][0].to).toEqual('buyer@test.com');
	expect(msg.ack).toHaveBeenCalled();
});

it('notifies + emails when the order is awaiting payment', async () => {
	const { listener, data, msg, userId } = await setup(OrderStatus.AwaitingPayment);
	await listener.onMessage(data, msg);
	expect(await Notification.countDocuments({ userId })).toEqual(1);
	expect(sendMail).toHaveBeenCalledTimes(1);
});

it('stays silent (no notification, no email) when already paid', async () => {
	const { listener, data, msg, userId } = await setup(OrderStatus.Complete);
	await listener.onMessage(data, msg);
	expect(await Notification.countDocuments({ userId })).toEqual(0);
	expect(sendMail).not.toHaveBeenCalled();
	expect(msg.ack).toHaveBeenCalled();
});

it('stays silent when the order was cancelled', async () => {
	const { listener, data, msg, userId } = await setup(OrderStatus.Cancelled);
	await listener.onMessage(data, msg);
	expect(await Notification.countDocuments({ userId })).toEqual(0);
	expect(sendMail).not.toHaveBeenCalled();
});
