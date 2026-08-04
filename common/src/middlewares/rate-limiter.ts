import { Request, Response, NextFunction } from 'express';
import {
	RateLimiterRedis,
	RateLimiterMemory,
	RateLimiterAbstract,
	RateLimiterRes,
} from 'rate-limiter-flexible';
import Redis from 'ioredis';

import { TooManyRequestsError } from '../errors/too-many-requests-error';
import { rateLimitRejections } from '../metrics';
import { logger } from '../logger';

// Abuse protection (#13). A small factory that returns an Express middleware
// enforcing "no more than `points` hits per `duration` seconds" for a key
// derived from the request (IP by default; email/user for targeted limits).
//
// Backed by Redis in real environments (shared counters across auth replicas);
// falls back to an in-process limiter under NODE_ENV=test so unit tests need no
// Redis. If Redis is unreachable at request time we FAIL OPEN — a login page
// that 500s under a Redis blip is worse than a momentarily un-throttled one.

export interface RateLimiterOptions {
	// Stable name for metrics + the Redis key namespace, e.g. 'signin-ip'.
	name: string;
	// Allowed hits within the window.
	points: number;
	// Window length in seconds.
	duration: number;
	// Derive the throttle key from the request. Default: client IP. Return a
	// falsy value to skip limiting this request (e.g. no email in the body).
	keyFn?: (req: Request) => string | undefined;
	// Optional override for the 429 message.
	message?: string;
}

// One Redis connection shared by every limiter in a service. Lazily created so
// importing common never opens a socket (tests, the seed script, etc.).
let sharedClient: Redis | undefined;
function redisClient(): Redis | undefined {
	const host = process.env.RATELIMIT_REDIS_HOST;
	if (!host) return undefined;
	if (!sharedClient) {
		sharedClient = new Redis({
			host,
			port: Number(process.env.RATELIMIT_REDIS_PORT) || 6379,
			// Don't let a slow/missing Redis stall request handling — we fail open.
			enableOfflineQueue: false,
			maxRetriesPerRequest: 1,
			lazyConnect: false,
		});
		// ioredis emits 'error' on every reconnect attempt; log once-ish, never throw.
		sharedClient.on('error', (err) =>
			logger.warn({ err: err.message }, 'ratelimit redis error (failing open)'),
		);
	}
	return sharedClient;
}

const defaultKey = (req: Request) => req.ip;

export const rateLimiter = (opts: RateLimiterOptions) => {
	const keyFn = opts.keyFn ?? defaultKey;

	// Choose the backend once, at wiring time. In test we use memory; otherwise
	// Redis if configured, else memory (single-replica dev without the add-on).
	const budget = {
		keyPrefix: `rl:${opts.name}`,
		points: opts.points,
		duration: opts.duration,
	};
	const client = process.env.NODE_ENV === 'test' ? undefined : redisClient();
	const limiter: RateLimiterAbstract = client
		? new RateLimiterRedis({ storeClient: client, ...budget })
		: new RateLimiterMemory(budget);

	return async (req: Request, res: Response, next: NextFunction) => {
		// Escape hatch so route unit tests aren't coupled to rate limits; the
		// limiter's own behaviour is covered by a dedicated test + live e2e.
		if (process.env.RATELIMIT_DISABLED === 'true') return next();

		const key = keyFn(req);
		if (!key) return next(); // nothing to key on → don't limit

		try {
			await limiter.consume(key);
			return next();
		} catch (err) {
			if (err instanceof RateLimiterRes) {
				// Genuine limit hit → 429 with a Retry-After.
				rateLimitRejections.inc({ limiter: opts.name });
				const retryAfter = Math.ceil(err.msBeforeNext / 1000) || 1;
				throw new TooManyRequestsError(opts.message, retryAfter);
			}
			// Any other rejection is a backend (Redis) failure → fail open.
			logger.warn(
				{ limiter: opts.name, err: (err as Error)?.message },
				'rate limiter unavailable — allowing request',
			);
			return next();
		}
	};
};
