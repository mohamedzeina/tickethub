import { Request } from 'express';
import jwt from 'jsonwebtoken';
import { UserDoc } from '../models/user';

// Mint a JWT for the user and store it on the cookie session. emailVerified is
// embedded so downstream services can gate actions without calling auth (#7);
// any route that changes it (verify-email) must call this again to refresh the
// cookie.
export const setSession = (req: Request, user: UserDoc): void => {
	const token = jwt.sign(
		{
			id: user.id,
			email: user.email,
			emailVerified: user.emailVerified,
		},
		process.env.JWT_KEY!,
	);

	req.session = { jwt: token };
};
