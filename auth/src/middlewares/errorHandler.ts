import { Request, Response, NextFunction } from 'express';
import { DatabaseConnectionError } from '../errors/databaseConnectionError';
import { RequestValidationError } from '../errors/requestValidationError';

export const errorHandler = (
	err: Error,
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	if (err instanceof RequestValidationError) {
		console.log('Handling RequestValidationError');
	}
	if (err instanceof DatabaseConnectionError) {
		console.log('Handling DatabaseConnectionError');
	}

	res.status(400).send({
		message: err.message,
	});
};
