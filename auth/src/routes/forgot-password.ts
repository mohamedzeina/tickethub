import express, { Request, Response } from 'express';

import { User } from '../models/user';
import { issuePasswordReset } from '../services/account-emails';
import { emailRule } from './validators';
import { validateRequest } from '@zeina-tickethub/common';
import {
	forgotPasswordIpLimiter,
	forgotPasswordEmailLimiter,
} from '../middlewares/rate-limiters';

const router = express.Router();

// Start a password reset. Responds 200 regardless of whether the email exists,
// so an attacker can't probe which addresses have accounts (email enumeration).
router.post(
	'/api/users/forgot-password',
	forgotPasswordIpLimiter,
	forgotPasswordEmailLimiter,
	[emailRule('A valid email is required')],
	validateRequest,
	async (req: Request, res: Response) => {
		const { email } = req.body;

		const user = await User.findOne({ email });
		if (user) {
			await issuePasswordReset(user);
		}

		res.send({
			message: 'If an account exists for that email, a reset link is on its way.',
		});
	},
);

export { router as forgotPasswordRouter };
