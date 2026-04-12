import { CustomError } from './customError';

export class DatabaseConnectionError extends CustomError {
	statusCode = 500;
	reason = 'Connection to database failed';

	constructor() {
		super('Connection to database failed');

		Object.setPrototypeOf(this, DatabaseConnectionError.prototype);
	}

	serializeErrors() {
		return [{ message: this.reason }];
	}
}
