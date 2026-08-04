import express, { Request, Response } from 'express';

import { User } from '../models/user';
import { emailRule, passwordRule } from './validators';
import { setSession } from '../services/session';
import { issueVerification } from '../services/account-emails';
import { BadRequestError, validateRequest } from '@zeina-tickethub/common';
import { signupIpLimiter } from '../middlewares/rate-limiters';
import { isDuplicateKey } from '../is-duplicate-key';

const router = express.Router();

router.post(
	'/api/users/signup',
	signupIpLimiter,
	[
		emailRule('Email must be valid'),
		passwordRule(),
	],
	validateRequest,
	async (req: Request, res: Response) => {
		const { email, password } = req.body;

		const existingUser = await User.findOne({ email });

		if (existingUser) {
			throw new BadRequestError('Email already in use');
		}

		const user = User.build({ email, password });
		try {
			await user.save();
		} catch (err) {
			// The unique index rejected a concurrent signup that slipped past the
			// findOne above. Same 400 the pre-check would have produced, so the
			// race is invisible to the client.
			if (isDuplicateKey(err)) {
				throw new BadRequestError('Email already in use');
			}
			throw err;
		}

		// Send the verification email (mints + stores a hashed token, publishes
		// the request). New accounts start unverified.
		await issueVerification(user);

		// Sign the user in; the JWT records emailVerified: false until they confirm.
		setSession(req, user);

		res.status(201).send(user);
	},
);

export { router as signUpRouter };
