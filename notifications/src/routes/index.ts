import express, { Request, Response } from 'express';
import { requireAuth } from '@zeina-tickethub/common';
import { Notification } from '../models/notification';

const router = express.Router();

// The signed-in user's notification feed, newest first, plus the unread count
// (so the navbar bell can render a badge without a second request). Capped to a
// sane page size — the feed is a recent-activity view, not an archive.
router.get(
	'/api/notifications',
	requireAuth,
	async (req: Request, res: Response) => {
		const userId = req.currentUser!.id;

		const [notifications, unreadCount] = await Promise.all([
			Notification.find({ userId }).sort({ createdAt: -1 }).limit(50),
			Notification.countDocuments({ userId, read: false }),
		]);

		res.status(200).send({ notifications, unreadCount });
	},
);

export { router as indexNotificationRouter };
