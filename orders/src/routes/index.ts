import express, { Request, Response } from 'express';
import { requireAuth } from '@zeina-tickethub/common';
import { Order } from '../models/order';

const router = express.Router();

router.get(
	'/api/orders',
	requireAuth,
	async (req: Request, res: Response) => {
		// Newest first — the ObjectId _id is time-ordered, so sorting on it
		// descending puts the most recent order at the top of "My Orders".
		const orders = await Order.find({
			userId: req.currentUser?.id,
		})
			.sort({ _id: -1 })
			.populate('ticket');

		res.status(200).send(orders);
	},
);

export { router as indexOrderRouter };
