import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../errors/custom-error';
import { TooManyRequestsError } from '../errors/too-many-requests-error';
import { logger } from '../logger';

export const errorHandler = (
	err: Error,
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	if (err instanceof CustomError) {
		// Advertise when to retry on a throttle so clients can back off politely.
		if (err instanceof TooManyRequestsError && err.retryAfter) {
			res.set('Retry-After', String(err.retryAfter));
		}
		return res.status(err.statusCode).send({ errors: err.serializeErrors() });
	}

	// Prefer the request-scoped child logger (carries the request id) when
	// pino-http is mounted; fall back to the shared logger otherwise.
	(req.log ?? logger).error({ err }, 'unhandled request error');
	res.status(400).send({
		errors: [{ message: 'Something went wrong' }],
	});
};
