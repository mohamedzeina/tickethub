import express, { Request, Response } from 'express';
import { requireAuth } from '@zeina-tickethub/common';
import { Notification } from '../models/notification';

const router = express.Router();

// Mark every unread notification for the signed-in user as read.
router.post(
	'/api/notifications/read-all',
	requireAuth,
	async (req: Request, res: Response) => {
		await Notification.updateMany(
			{ userId: req.currentUser!.id, read: false },
			{ $set: { read: true } },
		);

		res.status(200).send({});
	},
);

export { router as readAllNotificationRouter };
