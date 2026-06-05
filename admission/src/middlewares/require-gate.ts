import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { NotAuthorizedError } from '@zeina-tickethub/common';

// Guards the gate-scan endpoint with a shared operator key (the `x-gate-key`
// header must equal GATE_API_KEY). A stand-in for proper venue/operator auth —
// good enough for v1, swappable for an `operator` role later. Constant-time
// compare so the key can't be guessed byte-by-byte via timing.
export const requireGate = (
	req: Request,
	_res: Response,
	next: NextFunction,
) => {
	const provided = Buffer.from(req.get('x-gate-key') || '');
	const expected = Buffer.from(process.env.GATE_API_KEY || '');

	if (
		expected.length === 0 ||
		provided.length !== expected.length ||
		!crypto.timingSafeEqual(provided, expected)
	) {
		throw new NotAuthorizedError();
	}

	next();
};
