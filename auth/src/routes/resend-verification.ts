import express, { Request, Response } from 'express';

import { User } from '../models/user';
import { issueVerification } from '../services/account-emails';
import { currentUser, requireAuth } from '@zeina-tickethub/common';
import { resendVerificationLimiter } from '../middlewares/rate-limiters';

const router = express.Router();

// Re-send the verification email to the signed-in user. Always responds 200 so
// the UI can show the same "check your inbox" message whether or not a new mail
// was actually needed.
router.post(
	'/api/users/resend-verification',
	currentUser,
	requireAuth,
	resendVerificationLimiter,
	async (req: Request, res: Response) => {
		const user = await User.findById(req.currentUser!.id);

		if (user && !user.emailVerified) {
			await issueVerification(user);
		}

		res.send({ message: 'If your email needs confirming, a link is on its way.' });
	},
);

export { router as resendVerificationRouter };
