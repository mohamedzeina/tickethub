import express, { Request, Response } from 'express';
import { body } from 'express-validator';

import { findByToken } from '../services/tokens';
import { setSession } from '../services/session';
import { validateRequest, BadRequestError } from '@zeina-tickethub/common';
import { verifyEmailIpLimiter } from '../middlewares/rate-limiters';

const router = express.Router();

router.post(
	'/api/users/verify-email',
	verifyEmailIpLimiter,
	[body('token').notEmpty().withMessage('A verification token is required')],
	validateRequest,
	async (req: Request, res: Response) => {
		const { token } = req.body;

		const user = await findByToken(
			'verificationToken',
			'verificationTokenExpires',
			token,
		);

		if (!user) {
			throw new BadRequestError(
				'This verification link is invalid or has expired.',
			);
		}

		user.set({
			emailVerified: true,
			verificationToken: undefined,
			verificationTokenExpires: undefined,
		});
		await user.save();

		// Refresh the cookie so emailVerified flips to true everywhere immediately.
		setSession(req, user);

		res.send(user);
	},
);

export { router as verifyEmailRouter };
