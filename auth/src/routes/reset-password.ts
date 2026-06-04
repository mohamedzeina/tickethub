import express, { Request, Response } from 'express';
import { body } from 'express-validator';

import { User } from '../models/user';
import { TokenManager } from '../services/tokens';
import { setSession } from '../services/session';
import { validateRequest, BadRequestError } from '@zeina-tickethub/common';
import { resetPasswordIpLimiter } from '../middlewares/rate-limiters';

const router = express.Router();

router.post(
	'/api/users/reset-password',
	resetPasswordIpLimiter,
	[
		body('token').notEmpty().withMessage('A reset token is required'),
		body('password')
			.trim()
			.isLength({ min: 4, max: 20 })
			.withMessage('Password must be between 4 and 20 characters'),
	],
	validateRequest,
	async (req: Request, res: Response) => {
		const { token, password } = req.body;

		const user = await User.findOne({
			passwordResetToken: TokenManager.hash(token),
			passwordResetExpires: { $gt: new Date() },
		});

		if (!user) {
			throw new BadRequestError(
				'This password reset link is invalid or has expired.',
			);
		}

		// The pre-save hook re-hashes the password. Completing a reset proves the
		// user controls the inbox, so treat the email as verified too.
		user.set({
			password,
			emailVerified: true,
			passwordResetToken: undefined,
			passwordResetExpires: undefined,
		});
		await user.save();

		// Sign them straight in with a fresh, verified session.
		setSession(req, user);

		res.send(user);
	},
);

export { router as resetPasswordRouter };
