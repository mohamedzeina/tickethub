import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import {
	requireAuth,
	validateRequest,
	BadRequestError,
	NotFoundError,
} from '@zeina-tickethub/common';
import { Order } from '../models/order';

const router = express.Router();

router.post(
	'/api/payments',
	requireAuth,
	[body('token').not().isEmpty(), body('orderId').not().isEmpty()],
	validateRequest,
	(req: Request, res: Response) => {
		return { success: true };
	},
);

export { router as createChargeRouter };
