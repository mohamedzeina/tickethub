import express, { Request, Response } from 'express';
import { requireAuth } from '@zeina-tickethub/common';
import { loadOwnedOrder } from '../services/load-owned-order';

const router = express.Router();

router.get(
	'/api/orders/:orderId',
	requireAuth,
	async (req: Request, res: Response) => {
		const order = await loadOwnedOrder(req);

		res.status(200).send(order);
	},
);

export { router as showOrderRouter };
