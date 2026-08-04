import request from 'supertest';
import { app } from '../../app';
import { buildNotification, oid } from '../../test/helpers';

it('requires auth', async () => {
	await request(app).get('/api/notifications').send().expect(401);
});

it('returns only the signed-in user notifications, newest first', async () => {
	const userId = oid();
	const otherId = oid();

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
	const userId = oid();
	await buildNotification(userId, { read: false });
	await buildNotification(userId, { read: false });
	await buildNotification(userId, { read: true });

	const res = await request(app)
		.get('/api/notifications')
		.set('Cookie', global.signin(userId))
		.expect(200);

	expect(res.body.notifications.length).toEqual(3);
	expect(res.body.unreadCount).toEqual(2);
});
