import request from 'supertest';
import { app } from '../../app';
import { Notification } from '../../models/notification';
import { buildNotification, oid } from '../../test/helpers';

it('marks all of the user unread notifications read, leaving others alone', async () => {
	const userId = oid();
	const otherId = oid();

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
