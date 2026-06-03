import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import { Notification, NotificationType } from '../../models/notification';

const buildNotification = async (userId: string, read = false) => {
	const n = Notification.build({
		userId,
		type: NotificationType.PaymentSucceeded,
		title: 'Payment confirmed',
		body: 'body',
	});
	n.set({ read });
	await n.save();
	return n;
};

it('requires auth', async () => {
	await request(app).get('/api/notifications').send().expect(401);
});

it('returns only the signed-in user notifications, newest first', async () => {
	const userId = new mongoose.Types.ObjectId().toHexString();
	const otherId = new mongoose.Types.ObjectId().toHexString();

	await buildNotification(userId);
	await buildNotification(userId);
	await buildNotification(otherId); // belongs to someone else

	const res = await request(app)
		.get('/api/notifications')
		.set('Cookie', global.signin(userId))
		.expect(200);

	expect(res.body.notifications.length).toEqual(2);
	res.body.notifications.forEach((n: any) => expect(n.userId).toEqual(userId));
});

it('reports the unread count', async () => {
	const userId = new mongoose.Types.ObjectId().toHexString();
	await buildNotification(userId, false);
	await buildNotification(userId, false);
	await buildNotification(userId, true);

	const res = await request(app)
		.get('/api/notifications')
		.set('Cookie', global.signin(userId))
		.expect(200);

	expect(res.body.notifications.length).toEqual(3);
	expect(res.body.unreadCount).toEqual(2);
});
