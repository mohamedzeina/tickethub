import { Request, Response, NextFunction } from 'express';

import { ForbiddenError } from '../errors/forbidden-error';

// Gate value-bearing actions (listing, buying) on a confirmed email (#7). Use
// AFTER requireAuth, which guarantees req.currentUser is set. emailVerified is
// read from the JWT; auth re-issues the cookie when the user verifies.
export const requireVerified = (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	if (!req.currentUser?.emailVerified) {
		throw new ForbiddenError(
			'Please verify your email address before buying or selling tickets.',
		);
	}

	next();
};
