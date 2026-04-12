import { CustomError } from './customError';

export class BadRequestError extends CustomError {
	statusCode = 400;

	constructor(public errorMessage: string) {
		super(errorMessage);

		Object.setPrototypeOf(this, BadRequestError.prototype);
	}

	serializeErrors() {
		return [{ message: this.errorMessage }];
	}
}
