import express, { Request, Response } from 'express';
import { requireAuth, NotAuthorizedError } from '@zeina-tickethub/common';
import { Order } from '../models/order';

const router = express.Router();

router.get(
	'/api/orders/:orderId',
	requireAuth,
	async (req: Request, res: Response) => {
		const orders = await Order.find({
			userId: req.currentUser?.id,
		}).populate('ticket');

		res.status(200).send(orders);
	},
);

export { router as showOrderRouter };
