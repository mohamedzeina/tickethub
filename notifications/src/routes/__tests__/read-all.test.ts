import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import { Notification, NotificationType } from '../../models/notification';

const buildNotification = async (userId: string) => {
	const n = Notification.build({
		userId,
		type: NotificationType.OrderCreated,
		title: 'Reservation placed',
		body: 'body',
	});
	await n.save();
	return n;
};

it('marks all of the user unread notifications read, leaving others alone', async () => {
	const userId = new mongoose.Types.ObjectId().toHexString();
	const otherId = new mongoose.Types.ObjectId().toHexString();

	await buildNotification(userId);
	await buildNotification(userId);
	const otherUserNotification = await buildNotification(otherId);

	await request(app)
		.post('/api/notifications/read-all')
		.set('Cookie', global.signin(userId))
		.expect(200);

	const unread = await Notification.countDocuments({ userId, read: false });
	expect(unread).toEqual(0);

	// Another user's notification is untouched.
	const other = await Notification.findById(otherUserNotification.id);
	expect(other!.read).toEqual(false);
});
