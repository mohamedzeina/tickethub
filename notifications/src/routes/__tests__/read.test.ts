import request from 'supertest';
import { app } from '../../app';
import { Notification } from '../../models/notification';
import { buildNotification, oid } from '../../test/helpers';

it('marks a notification read for its owner', async () => {
	const userId = oid();
	const n = await buildNotification(userId);

	const res = await request(app)
		.post(`/api/notifications/${n.id}/read`)
		.set('Cookie', global.signin(userId))
		.expect(200);

	expect(res.body.read).toEqual(true);

	const updated = await Notification.findById(n.id);
	expect(updated!.read).toEqual(true);
});

it('404s for an unknown notification', async () => {
	const userId = oid();
	const id = oid();

	await request(app)
		.post(`/api/notifications/${id}/read`)
		.set('Cookie', global.signin(userId))
		.expect(404);
});

it('401s when marking someone else notification read', async () => {
	const ownerId = oid();
	const n = await buildNotification(ownerId);

	await request(app)
		.post(`/api/notifications/${n.id}/read`)
		.set('Cookie', global.signin()) // different user
		.expect(401);

	const still = await Notification.findById(n.id);
	expect(still!.read).toEqual(false);
});
