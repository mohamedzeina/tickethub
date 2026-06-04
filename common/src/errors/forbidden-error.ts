import { CustomError } from './custom-error';

// Authenticated but not permitted (e.g. email not yet verified). Distinct from
// NotAuthorizedError (401, "who are you?") — this is 403, "I know who you are,
// you just can't do this yet".
export class ForbiddenError extends CustomError {
	statusCode = 403;

	constructor(public message: string = 'Forbidden') {
		super(message);

		Object.setPrototypeOf(this, ForbiddenError.prototype);
	}

	serializeErrors() {
		return [{ message: this.message }];
	}
}
