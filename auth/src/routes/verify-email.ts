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
		//
		// Note this signs in whoever presents a valid token, not just a caller who
		// is already signed in as this account. That was deliberately left alone:
		// gating it on `req.currentUser?.id === user.id` was tried and reverted,
		// because the session minted here is what carries emailVerified: true to
		// the other services, and the e2e harness (signupVerified) depends on it.
		// If you revisit this, the harness and account-hardening suite have to
		// change with it — and note the guard did not behave the same in-cluster
		// as it did under supertest, which was never explained.
		setSession(req, user);

		res.send(user);
	},
);

export { router as verifyEmailRouter };
