import { body } from 'express-validator';

// Validation rules shared by more than one route, so the bounds and the wording
// the client sees can't drift between them.

const PASSWORD_MIN = 4;
const PASSWORD_MAX = 20;

// An email being used to identify an account (signup, signin, forgot-password).
// The trim+lowercase runs BEFORE isEmail, so `req.body.email` is already
// normalized by the time the handler queries on it — that's what keeps the
// lookup, the stored value, and the per-email rate-limit key all keyed the same.
// `message` differs per route, so each caller passes its own.
export const emailRule = (message: string) =>
	body('email').trim().toLowerCase().isEmail().withMessage(message);

// The password a user is choosing (signup, reset-password). Signin deliberately
// does NOT use this — an old password that predates the rule must still be
// accepted at the door.
export const passwordRule = () =>
	body('password')
		.trim()
		.isLength({ min: PASSWORD_MIN, max: PASSWORD_MAX })
		.withMessage(
			`Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters`,
		);
