export class DatabaseConnectionError extends Error {
	reason = 'Connection to database failed';

	constructor() {
		super();

		Object.setPrototypeOf(this, DatabaseConnectionError.prototype);
	}
}
