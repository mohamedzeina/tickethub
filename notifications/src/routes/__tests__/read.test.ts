import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import { Notification, NotificationType } from '../../models/notification';

const buildNotification = async (userId: string) => {
	const n = Notification.build({
		userId,
		type: NotificationType.HoldExpiring,
		title: 'Hold expiring soon',
		body: 'body',
	});
	await n.save();
	return n;
};

it('marks a notification read for its owner', async () => {
	const userId = new mongoose.Types.ObjectId().toHexString();
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
	const userId = new mongoose.Types.ObjectId().toHexString();
	const id = new mongoose.Types.ObjectId().toHexString();

	await request(app)
		.post(`/api/notifications/${id}/read`)
		.set('Cookie', global.signin(userId))
		.expect(404);
});

it('401s when marking someone else notification read', async () => {
	const ownerId = new mongoose.Types.ObjectId().toHexString();
	const n = await buildNotification(ownerId);

	await request(app)
		.post(`/api/notifications/${n.id}/read`)
		.set('Cookie', global.signin()) // different user
		.expect(401);

	const still = await Notification.findById(n.id);
	expect(still!.read).toEqual(false);
});
