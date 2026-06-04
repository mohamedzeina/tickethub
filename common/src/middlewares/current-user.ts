import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import 'cookie-session';

// Define the structure of the JWT payload
interface UserPayload {
	id: string;
	email: string;
	// Whether the user has confirmed their email (#7). Carried in the JWT so
	// other services can gate actions without calling auth; auth re-issues the
	// cookie when the user verifies. Optional for tokens minted before #7.
	emailVerified?: boolean;
}

// Extend Express Request interface to include currentUser property
declare global {
	namespace Express {
		interface Request {
			currentUser?: UserPayload;
		}
	}
}

export const currentUser = (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	if (!req.session?.jwt) {
		return next();
	}
	try {
		const payload = jwt.verify(
			req.session.jwt,
			process.env.JWT_KEY!,
		) as UserPayload;
		req.currentUser = payload;
	} catch (err) {}

	next();
};
