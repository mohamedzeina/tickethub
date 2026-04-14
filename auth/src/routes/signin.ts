import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import jwt from 'jsonwebtoken';

import { PasswordManager } from '../services/password';
import { User } from '../models/user';
import { validateRequest } from '../middlewares/validateRequest';
import { BadRequestError } from '../errors/badRequestError';

const router = express.Router();

router.post(
	'/api/users/signin',
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

		// Generate JWT
		const userJWT = jwt.sign(
			{
				id: existingUser.id,
				email: existingUser.email,
			},
			process.env.JWT_KEY!,
		);

		// Store it on session object
		req.session = {
			jwt: userJWT,
		};

		res.status(200).send(existingUser);
	},
);

export { router as signInRouter };
