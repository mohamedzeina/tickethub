import { CustomError } from './custom-error';

// Rate limit tripped (#13). 429, distinct from 403 (allowed identity, wrong
// state) — this is "you're going too fast". `retryAfter` (seconds) is surfaced
// so callers/middleware can set a Retry-After header.
export class TooManyRequestsError extends CustomError {
	statusCode = 429;

	constructor(
		public message: string = 'Too many requests — please slow down and try again shortly.',
		public retryAfter?: number,
	) {
		super(message);

		Object.setPrototypeOf(this, TooManyRequestsError.prototype);
	}

	serializeErrors() {
		return [{ message: this.message }];
	}
}
