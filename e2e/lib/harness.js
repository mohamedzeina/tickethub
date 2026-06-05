/**
 * Shared harness for TicketHub live e2e suites.
 *
 * Every domain suite (e2e/<domain>.js) exports `async function run(t)` where `t`
 * is a Reporter, and uses these helpers to drive the real API through the
 * ingress. Run the whole thing with `node e2e/run-all.js`, or a single suite
 * standalone with `node e2e/<domain>.js`.
 *
 * Env:
 *   BASE_URL     API base.        Default https://tickethub.com
 *   MAILPIT_URL  Mailpit web/API. Default http://localhost:8025
 *   HOST_HEADER  Override Host header (when BASE_URL is an IP).
 *   RATELIMIT_BYPASS_TOKEN  Sent as the x-ratelimit-bypass header on every
 *                request so repeated runs don't exhaust the auth per-IP limits.
 *                Auth honours it only when the same token is set in its (dev-only)
 *                env, so it's inert in prod. Default 'e2e-bypass'. The abuse suite
 *                opts out (noBypass) so it still exercises the real limiter.
 *
 * Mail-dependent suites need:  kubectl port-forward svc/mailpit-srv 8025:8025
 */

const crypto = require('crypto');

const BASE_URL = (process.env.BASE_URL || 'https://tickethub.com').replace(/\/$/, '');
const MAILPIT_URL = (process.env.MAILPIT_URL || 'http://localhost:8025').replace(/\/$/, '');
const HOST_HEADER = process.env.HOST_HEADER;
// Default matches the token set in infra/k8s/auth-depl.yaml (dev cluster only).
const RATELIMIT_BYPASS_TOKEN = process.env.RATELIMIT_BYPASS_TOKEN || 'e2e-bypass';

// The local dev ingress serves a self-signed cert; relax TLS for it only.
let targetHost = '';
try {
	targetHost = HOST_HEADER || new URL(BASE_URL).hostname;
} catch {}
if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED && targetHost === 'tickethub.com') {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Unique-per-run identifiers so suites can run on top of seed data without
// colliding, and carry no secret-shaped literals.
const stamp = Date.now();
let seq = 0;
const uniqueEmail = (who = 'user') => `${who}+${stamp}-${seq++}@e2e.test`;
// A fresh random throwaway credential each call (18 hex chars, within the 4–20
// length rule). Random rather than derived so there is no static literal for a
// secret scanner to flag — it is never a real account password.
const testPassword = () => crypto.randomBytes(9).toString('hex');
const futureDate = (days = 30) => new Date(Date.now() + days * 864e5).toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- http ----------------------------------------------------------------

function sessionCookie(setCookie) {
	if (!setCookie) return null;
	const m = setCookie.match(/session=[^;]+/);
	return m ? m[0] : null;
}

// Returns { status, data, cookie }; never throws on a non-2xx so suites can
// assert on 4xx. `cookie` is the refreshed session cookie if one was set.
// Pass `noBypass: true` to omit the rate-limit bypass header — used by the abuse
// suite so it actually trips the limiter.
async function api(path, { method = 'POST', cookie, body, headers: extra, noBypass } = {}) {
	const headers = { 'Content-Type': 'application/json' };
	if (!noBypass) headers['x-ratelimit-bypass'] = RATELIMIT_BYPASS_TOKEN;
	Object.assign(headers, extra || {});
	if (cookie) headers.Cookie = cookie;
	if (HOST_HEADER) headers.Host = HOST_HEADER;

	const res = await fetch(`${BASE_URL}${path}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	let data = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = text;
	}
	return { status: res.status, data, cookie: sessionCookie(res.headers.get('set-cookie')) };
}

// Poll an async fn until `until(result)` is truthy (or tries run out). Useful
// for cross-service replication lag (e.g. payments' Order replica).
async function retry(fn, { tries = 20, delay = 400, until } = {}) {
	let result = await fn();
	for (let i = 0; i < tries - 1 && !until(result); i++) {
		await sleep(delay);
		result = await fn();
	}
	return result;
}

// ---- mailpit -------------------------------------------------------------

async function ensureMailpit() {
	try {
		const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=1`);
		return res.ok;
	} catch {
		return false;
	}
}

// Newest message to `to` whose subject contains `subjectIncludes`; pull the
// 64-hex token out of the verify/reset link in its body.
async function waitForMailToken(to, subjectIncludes, { tries = 40, delay = 500 } = {}) {
	for (let i = 0; i < tries; i++) {
		const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=100`);
		if (res.ok) {
			const { messages = [] } = await res.json();
			const match = messages
				.filter(
					(m) =>
						(m.To || []).some((a) => a.Address === to) &&
						(m.Subject || '').includes(subjectIncludes),
				)
				.sort((a, b) => new Date(b.Created) - new Date(a.Created))[0];
			if (match) {
				const full = await (await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`)).json();
				const tok = `${full.Text || ''} ${full.HTML || ''}`.match(/token=([a-f0-9]{64})/);
				if (tok) return tok[1];
			}
		}
		await sleep(delay);
	}
	throw new Error(`no "${subjectIncludes}" email for ${to} found in Mailpit`);
}

// Count messages to an address with a matching subject (for notification-email
// assertions). Returns a number.
async function countMail(to, subjectIncludes) {
	const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=200`);
	if (!res.ok) return 0;
	const { messages = [] } = await res.json();
	return messages.filter(
		(m) =>
			(m.To || []).some((a) => a.Address === to) &&
			(m.Subject || '').includes(subjectIncludes),
	).length;
}

// ---- account helpers -----------------------------------------------------

// Sign up a brand-new (UNVERIFIED) user. Returns creds + session cookie + id.
async function signup(prefix = 'user') {
	const email = uniqueEmail(prefix);
	const password = testPassword();
	const r = await api('/api/users/signup', { body: { email, password } });
	return { email, password, cookie: r.cookie, userId: r.data?.id, status: r.status };
}

// Verify an account via the Mailpit link. Returns the refreshed cookie.
async function verify(email) {
	const token = await waitForMailToken(email, 'Verify your email');
	const r = await api('/api/users/verify-email', { body: { token } });
	return { status: r.status, cookie: r.cookie, verified: r.data?.emailVerified };
}

// Sign up AND verify — the common precondition for selling/buying. Returns
// creds + a VERIFIED session cookie + userId. Requires Mailpit.
async function signupVerified(prefix = 'user') {
	const u = await signup(prefix);
	const v = await verify(u.email);
	return { ...u, cookie: v.cookie || u.cookie, verified: true };
}

// ---- domain helpers ------------------------------------------------------

// Create a valid listing as `cookie` (a verified seller). Override any field.
async function createListing(cookie, overrides = {}) {
	const body = {
		title: `E2E Listing ${stamp}-${seq++}`,
		price: 42,
		venue: 'The O2, London',
		eventDate: futureDate(30),
		category: 'Concerts',
		description: 'An automated e2e listing.',
		...overrides,
	};
	return api('/api/tickets', { cookie, body });
}

// Reserve a ticket (create an order). One-shot — use for negative cases
// (self-purchase, already-reserved, non-existent). Returns { status, data }.
async function reserve(cookie, ticketId) {
	return api('/api/orders', { cookie, body: { ticketId } });
}

// Happy-path reserve: retry while orders' Ticket replica (fed by ticket:created)
// catches up after a fresh listing — a one-shot reserve can 404 before the
// replica lands. Stops on the first non-404 (201 on success).
async function reserveReady(cookie, ticketId) {
	return retry(() => reserve(cookie, ticketId), {
		tries: 20,
		delay: 400,
		until: (r) => r.status !== 404,
	});
}

// Start a payment, retrying on 404 while payments' Order replica catches up
// (the order:created event can lag the order's 201). Returns the final result.
async function payIntent(cookie, orderId) {
	return retry(() => api('/api/payments', { cookie, body: { orderId } }), {
		tries: 15,
		delay: 400,
		until: (r) => r.status !== 404,
	});
}

// ---- reporter ------------------------------------------------------------

class Reporter {
	constructor() {
		this.passed = 0;
		this.failures = [];
	}
	suite(name) {
		console.log(`\n${name}`);
	}
	check(label, ok, detail) {
		if (ok) {
			this.passed++;
			console.log(`  ✓ ${label}`);
		} else {
			this.failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
			console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
		}
		return ok;
	}
	is(label, actual, expected) {
		return this.check(label, actual === expected, `expected ${expected}, got ${actual}`);
	}
	// Print summary; return true if everything passed.
	finish() {
		const total = this.passed + this.failures.length;
		console.log(`\n${'─'.repeat(52)}`);
		if (this.failures.length === 0) {
			console.log(`✓ ALL ${this.passed} checks passed.\n`);
			return true;
		}
		console.log(`✗ ${this.failures.length} of ${total} checks FAILED:\n`);
		this.failures.forEach((f) => console.log(`   • ${f}`));
		console.log('');
		return false;
	}
}

// Run a single suite module standalone: `if (require.main === module)
// runStandalone(require('./x'), { needsMail: true })`.
async function runStandalone(run, { needsMail = false } = {}) {
	console.log(`\nTicketHub e2e → ${BASE_URL}  (mail: ${MAILPIT_URL})`);
	if (needsMail && !(await ensureMailpit())) {
		console.error(
			`\n✖ Cannot reach Mailpit at ${MAILPIT_URL}.\n  Run:  kubectl port-forward svc/mailpit-srv 8025:8025\n`,
		);
		process.exit(1);
	}
	const t = new Reporter();
	try {
		await run(t);
	} catch (err) {
		t.check('suite crashed', false, err.message);
	}
	process.exit(t.finish() ? 0 : 1);
}

module.exports = {
	BASE_URL,
	MAILPIT_URL,
	api,
	retry,
	sleep,
	uniqueEmail,
	testPassword,
	futureDate,
	ensureMailpit,
	waitForMailToken,
	countMail,
	signup,
	verify,
	signupVerified,
	createListing,
	reserve,
	reserveReady,
	payIntent,
	Reporter,
	runStandalone,
};
