export abstract class CustomError extends Error {
	abstract statusCode: number;

	constructor(message: string) {
		super(message);
		// No setPrototypeOf here: every concrete subclass sets its own prototype,
		// which overwrites whatever this abstract base would set anyway.
	}

	abstract serializeErrors(): { message: string; field?: string }[];
}
