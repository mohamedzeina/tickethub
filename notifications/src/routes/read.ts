import express, { Request, Response } from 'express';
import {
	requireAuth,
	NotFoundError,
	NotAuthorizedError,
} from '@zeina-tickethub/common';
import { Notification } from '../models/notification';

const router = express.Router();

// Mark a single notification read. Scoped to the owner.
router.post(
	'/api/notifications/:id/read',
	requireAuth,
	async (req: Request, res: Response) => {
		const notification = await Notification.findById(req.params.id);

		if (!notification) {
			throw new NotFoundError();
		}
		if (notification.userId !== req.currentUser!.id) {
			throw new NotAuthorizedError();
		}

		notification.set({ read: true });
		await notification.save();

		res.status(200).send(notification);
	},
);

export { router as readNotificationRouter };
