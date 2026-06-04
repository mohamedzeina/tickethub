import express, { Request, Response } from 'express';
import { body } from 'express-validator';

import { User } from '../models/user';
import { setSession } from '../services/session';
import { issueVerification } from '../services/account-emails';
import { BadRequestError, validateRequest } from '@zeina-tickethub/common';

const router = express.Router();

router.post(
	'/api/users/signup',
	[
		body('email').isEmail().withMessage('Email must be valid'),
		body('password')
			.trim()
			.isLength({ min: 4, max: 20 })
			.withMessage('Password must be between 4 and 20 characters'),
	],
	validateRequest,
	async (req: Request, res: Response) => {
		const { email, password } = req.body;

		const existingUser = await User.findOne({ email });

		if (existingUser) {
			throw new BadRequestError('Email already in use');
		}

		const user = User.build({ email, password });
		await user.save();

		// Send the verification email (mints + stores a hashed token, publishes
		// the request). New accounts start unverified.
		await issueVerification(user);

		// Sign the user in; the JWT records emailVerified: false until they confirm.
		setSession(req, user);

		res.status(201).send(user);
	},
);

export { router as signUpRouter };
