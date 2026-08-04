import { Request, Response, NextFunction, RequestHandler } from 'express';
import { rateLimiter, RateLimiterOptions } from '@zeina-tickethub/common';
import { normalizeEmail } from '../services/normalize-email';

// Abuse protection for the auth endpoints (#13). Two dimensions where it helps:
// per-IP (one host hammering us) and per-email (one account targeted from many
// hosts). Limits are deliberately generous for humans, punishing for scripts.

// Test/dev escape hatch. A request whose `x-ratelimit-bypass` header matches
// RATELIMIT_BYPASS_TOKEN skips the limiter entirely. The token env is set ONLY in
// the dev cluster manifest (infra/k8s/auth-depl.yaml), so with no token set in
// prod the header is inert and the limiter always runs. This lets the live e2e
// suite run repeatedly without exhausting the per-IP budgets, while the abuse
// suite — which omits the header — still exercises the real limiter end to end.
const withBypass = (mw: RequestHandler): RequestHandler => {
	return (req: Request, res: Response, next: NextFunction) => {
		const token = process.env.RATELIMIT_BYPASS_TOKEN;
		if (token && req.get('x-ratelimit-bypass') === token) {
			return next();
		}
		return mw(req, res, next);
	};
};

// Build a limiter with the bypass already applied. Every limiter below goes
// through this, so a new one can't silently ship without the escape hatch.
const limiter = (opts: RateLimiterOptions): RequestHandler =>
	withBypass(rateLimiter(opts));

// Key by the email in the body, normalized the same way we store and look it up,
// so casing can't be used to dodge the limit. This runs BEFORE the validator
// chain sanitizes req.body, hence the explicit normalize here rather than
// relying on emailRule(). Falsy → the limiter skips the request (validation will
// reject a missing/non-string email anyway).
const byEmail = (req: Request): string | undefined =>
	normalizeEmail(req.body?.email);

// Key by the signed-in user (resend runs after requireAuth).
const byUser = (req: Request): string | undefined => req.currentUser?.id;

// Two tiers below:
//   • per-EMAIL / per-USER limits are the real protection (one targeted account)
//     — deliberately tight; they key on a unique value so they never interfere
//     with unrelated traffic.
//   • per-IP limits are a blanket flood-stop. They're sized generously: a real
//     human is one signup / a few signins per IP, so hundreds-per-window still
//     blocks abuse, while staying clear of the single-IP e2e harness's volume.
//     (Per-IP only means anything if the ingress forwards the real client IP —
//     auth has `trust proxy` on; verify X-Forwarded-For end to end.)

// signin: per-email stops credential brute force; per-IP is the flood backstop.
export const signinIpLimiter = limiter({
	name: 'signin-ip',
	points: 100,
	duration: 15 * 60,
});
export const signinEmailLimiter = limiter({
	name: 'signin-email',
	points: 5,
	duration: 15 * 60,
	keyFn: byEmail,
	message: 'Too many sign-in attempts for this account. Please try again later.',
});

// signup: per-IP only (every signup has a unique email by definition).
export const signupIpLimiter = limiter({
	name: 'signup-ip',
	points: 100,
	duration: 60 * 60,
});

// forgot-password: per-email stops inbox flooding; per-IP is the flood backstop.
export const forgotPasswordIpLimiter = limiter({
	name: 'forgot-ip',
	points: 60,
	duration: 60 * 60,
});
export const forgotPasswordEmailLimiter = limiter({
	name: 'forgot-email',
	points: 3,
	duration: 60 * 60,
	keyFn: byEmail,
	message: 'A reset link was already requested. Please check your inbox or try again later.',
});

// resend-verification: per-user stops verification-email flooding.
export const resendVerificationLimiter = limiter({
	name: 'resend-verification-user',
	points: 3,
	duration: 60 * 60,
	keyFn: byUser,
	message: 'We already sent a verification email recently. Please wait a bit before retrying.',
});

// verify-email / reset-password: per-IP backstop (tokens are 64-hex, so guessing
// is already infeasible — this just caps obvious hammering).
export const verifyEmailIpLimiter = limiter({
	name: 'verify-email-ip',
	points: 100,
	duration: 60 * 60,
});
export const resetPasswordIpLimiter = limiter({
	name: 'reset-password-ip',
	points: 100,
	duration: 60 * 60,
});
