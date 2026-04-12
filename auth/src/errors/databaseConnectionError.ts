export class DatabaseConnectionError extends Error {
	statusCode = 500;
	reason = 'Connection to database failed';

	constructor() {
		super();

		Object.setPrototypeOf(this, DatabaseConnectionError.prototype);
	}

	serializeErrors() {
		return [{ message: this.reason }];
	}
}
