/**
 * #13 abuse protection — rate limiting on the auth endpoints, end to end.
 * Hammers signin (per-email), forgot-password (per-email), and resend-
 * verification (per-user) until each trips a 429, and checks the limits are
 * per-key (a fresh identity is unaffected) and carry a Retry-After header.
 *
 * Runs against the LIVE ratelimit-redis-backed limiter. Order matters: this
 * suite intentionally exhausts a few keys, but each key is unique-per-run so it
 * never collides with the other suites' accounts.
 *
 * Part of the suite (`node e2e/run-all.js`) or standalone (`node e2e/abuse.js`).
 */

const h = require('./lib/harness');

// Fire `n` POSTs to `path` with the same body; return the array of statuses.
async function hammer(path, body, n) {
	const statuses = [];
	for (let i = 0; i < n; i++) {
		const r = await h.api(path, { body });
		statuses.push(r.status);
	}
	return statuses;
}

async function run(t) {
	const stamp = Date.now();

	t.suite('SUITE 1 — signin brute force is throttled (per-email, limit 5/window)');
	const victim = `victim+${stamp}@e2e.test`;
	// 5 allowed (each a 400 on wrong creds), the 6th+ should be 429.
	const signinStatuses = await hammer(
		'/api/users/signin',
		{ email: victim, password: 'definitely-wrong' },
		8,
	);
	const first5Rejected400 = signinStatuses.slice(0, 5).every((s) => s === 400);
	const laterAre429 = signinStatuses.slice(5).some((s) => s === 429);
	t.check('first 5 signin attempts pass the limiter (→ 400 bad creds)', first5Rejected400,
		`got ${JSON.stringify(signinStatuses.slice(0, 5))}`);
	t.check('further signin attempts are blocked (→ 429)', laterAre429,
		`got ${JSON.stringify(signinStatuses)}`);

	t.suite('SUITE 2 — the throttle is per-key (a different email still works)');
	const other = await h.api('/api/users/signin', {
		body: { email: `other+${stamp}@e2e.test`, password: 'definitely-wrong' },
	});
	t.is('a different email is unaffected by the exhausted key (→ 400)', other.status, 400);

	t.suite('SUITE 3 — 429 carries a Retry-After header');
	// Re-hit the already-exhausted victim key and inspect the raw response.
	const blocked = await fetch(`${h.BASE_URL}/api/users/signin`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: victim, password: 'definitely-wrong' }),
	});
	t.is('blocked signin → 429', blocked.status, 429);
	t.check('429 includes a Retry-After header', !!blocked.headers.get('retry-after'),
		`headers had retry-after=${blocked.headers.get('retry-after')}`);

	t.suite('SUITE 4 — forgot-password is throttled per-email (limit 3/window)');
	const fpStatuses = await hammer(
		'/api/users/forgot-password',
		{ email: `reset+${stamp}@e2e.test` },
		6,
	);
	const fpFirst3Ok = fpStatuses.slice(0, 3).every((s) => s === 200);
	const fpLater429 = fpStatuses.slice(3).some((s) => s === 429);
	t.check('first 3 forgot-password requests pass (→ 200, no enumeration)', fpFirst3Ok,
		`got ${JSON.stringify(fpStatuses)}`);
	t.check('further forgot-password requests are blocked (→ 429)', fpLater429,
		`got ${JSON.stringify(fpStatuses)}`);

	t.suite('SUITE 5 — resend-verification is throttled per-user (limit 3/window)');
	const u = await h.signup('resendspam');
	t.is('signup returns 201', u.status, 201);
	const rvStatuses = [];
	for (let i = 0; i < 5; i++) {
		const r = await h.api('/api/users/resend-verification', { cookie: u.cookie });
		rvStatuses.push(r.status);
	}
	const rvFirst3Ok = rvStatuses.slice(0, 3).every((s) => s === 200);
	const rvLater429 = rvStatuses.slice(3).some((s) => s === 429);
	t.check('first 3 resend requests pass (→ 200)', rvFirst3Ok, `got ${JSON.stringify(rvStatuses)}`);
	t.check('further resend requests are blocked (→ 429)', rvLater429,
		`got ${JSON.stringify(rvStatuses)}`);
}

module.exports = run;

if (require.main === module) {
	h.runStandalone(run);
}
