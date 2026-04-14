import express, { Request, Response } from 'express';
import { body } from 'express-validator';

import { validateRequest } from '../middlewares/validateRequest';

const router = express.Router();

router.post(
	'/api/users/signin',
	[
		body('email').isEmail().withMessage('Invalid email address'),
		body('password').trim().notEmpty().withMessage('Password is required'),
	],
	validateRequest,
	(req: Request, res: Response) => {},
);

export { router as signInRouter };
