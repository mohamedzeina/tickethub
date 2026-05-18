import express, { Request, Response } from 'express';
import { requireAuth, validateRequest } from '@zeina-tickethub/common';
import { body } from 'express-validator';

const router = express.Router();

router.post(
	'/api/orders',
	requireAuth,
	[body('ticketId').not().isEmpty().withMessage('ticketId must be provided')],
	validateRequest,
	async (req: Request, res: Response) => {
		res.send({});
	},
);

export { router as newOrderRouter };
