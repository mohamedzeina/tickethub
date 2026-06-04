import express, { Request, Response } from 'express';
import { body } from 'express-validator';

import { PasswordManager } from '../services/password';
import { User } from '../models/user';
import { setSession } from '../services/session';
import { validateRequest, BadRequestError } from '@zeina-tickethub/common';
import { signinIpLimiter, signinEmailLimiter } from '../middlewares/rate-limiters';

const router = express.Router();

router.post(
	'/api/users/signin',
	signinIpLimiter,
	signinEmailLimiter,
	[
		body('email').isEmail().withMessage('Invalid email address'),
		body('password').trim().notEmpty().withMessage('Password is required'),
	],
	validateRequest,
	async (req: Request, res: Response) => {
		const { email, password } = req.body;

		const existingUser = await User.findOne({ email });
		if (!existingUser) {
			throw new BadRequestError('Invalid credentials');
		}

		const passwordsMatch = await PasswordManager.compare(
			existingUser.password,
			password,
		);
		if (!passwordsMatch) {
			throw new BadRequestError('Invalid credentials');
		}

		// Sign the user in; the JWT carries the current emailVerified flag.
		setSession(req, existingUser);

		res.status(200).send(existingUser);
	},
);

export { router as signInRouter };
