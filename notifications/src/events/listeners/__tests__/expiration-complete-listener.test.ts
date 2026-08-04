jest.mock('@zeina-tickethub/common', () => ({
	...jest.requireActual('@zeina-tickethub/common'),
	sendMail: jest.fn(),
}));

import { ExpirationCompleteEvent, OrderStatus, sendMail } from '@zeina-tickethub/common';
import { ExpirationCompleteListener } from '../expiration-complete-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import { Notification, NotificationType } from '../../../models/notification';
import { msg, seedOrder } from '../../../test/helpers';

const setup = async (status: OrderStatus) => {
	const listener = new ExpirationCompleteListener(natsWrapper.connection);

	const order = await seedOrder({
		status,
		userEmail: 'buyer@test.com',
		price: 20,
	});

	const data: ExpirationCompleteEvent['data'] = { orderId: order.id };

	return { listener, data, msg: msg(1), userId: order.userId, order };
};

it('notifies, emails, and cancels the replica when an unpaid hold lapses', async () => {
	const { listener, data, msg, userId, order } = await setup(OrderStatus.Created);
	await listener.onMessage(data, msg);

	const updated = await Order.findById(order.id);
	expect(updated!.status).toEqual(OrderStatus.Cancelled);

	const notifications = await Notification.find({ userId });
	expect(notifications.length).toEqual(1);
	expect(notifications[0].type).toEqual(NotificationType.HoldExpired);

	expect(sendMail).toHaveBeenCalledTimes(1);
	expect((sendMail as jest.Mock).mock.calls[0][0].to).toEqual('buyer@test.com');
	expect(msg.ack).toHaveBeenCalled();
});

it('stays silent (no notification, no email) when the order was already paid', async () => {
	const { listener, data, msg, userId } = await setup(OrderStatus.Complete);
	await listener.onMessage(data, msg);

	expect(await Notification.countDocuments({ userId })).toEqual(0);
	expect(sendMail).not.toHaveBeenCalled();
	expect(msg.ack).toHaveBeenCalled();
});
