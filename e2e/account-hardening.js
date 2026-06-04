/**
 * End-to-end checks for #7 account hardening, run against a LIVE cluster.
 *
 * Covers the negative paths (an unverified user is blocked from selling,
 * ordering and paying) and the full happy paths (verify → sell + buy + pay;
 * forgot → reset → sign in). Verification / reset tokens are pulled out of
 * Mailpit, exactly as a real user would click them from their inbox.
 *
 * Prereqs (see README / memory):
 *   • skaffold dev is up and all pods are Ready
 *   • the DB was freshly reseeded (this script uses unique emails, so it also
 *     runs fine on top of seed data)
 *   • Mailpit is reachable:  kubectl port-forward svc/mailpit-srv 8025:8025
 *
 * Env:
 *   BASE_URL     API base.        Default https://tickethub.com
 *   MAILPIT_URL  Mailpit web/API. Default http://localhost:8025
 *   HOST_HEADER  Override Host header (when BASE_URL is an IP).
 *
 * Run:  node e2e/account-hardening.js
 */

const BASE_URL = (process.env.BASE_URL || 'https://tickethub.com').replace(/\/$/, '');
const MAILPIT_URL = (process.env.MAILPIT_URL || 'http://localhost:8025').replace(/\/$/, '');
const HOST_HEADER = process.env.HOST_HEADER;

// The local dev ingress serves a self-signed cert; relax TLS for it (same as seed).
let targetHost = '';
try {
	targetHost = HOST_HEADER || new URL(BASE_URL).hostname;
} catch {}
if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED && targetHost === 'tickethub.com') {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const stamp = Date.now();
const email = (who) => `${who}+${stamp}@e2e.test`;
const PASS = 'pass1234';

// ---- assertions ----------------------------------------------------------

let passed = 0;
const failures = [];

function check(label, ok, detail) {
	if (ok) {
		passed++;
		console.log(`  ✓ ${label}`);
	} else {
		failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
		console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
	}
}

const is = (label, actual, expected) =>
	check(label, actual === expected, `expected ${expected}, got ${actual}`);

// ---- http ----------------------------------------------------------------

function sessionCookie(setCookie) {
	if (!setCookie) return null;
	const m = setCookie.match(/session=[^;]+/);
	return m ? m[0] : null;
}

// Returns { status, data, cookie } and never throws on a non-2xx — the whole
// point here is to assert on 4xx responses.
async function api(path, { method = 'POST', cookie, body } = {}) {
	const headers = { 'Content-Type': 'application/json' };
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
	return {
		status: res.status,
		data,
		cookie: sessionCookie(res.headers.get('set-cookie')),
	};
}

// ---- mailpit -------------------------------------------------------------

// Poll Mailpit for the newest message to `to` whose subject matches, and pull
// the token out of the verify/reset link in its body.
async function waitForToken(to, subjectIncludes, { tries = 30, delay = 500 } = {}) {
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
				const full = await (
					await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`)
				).json();
				const body = `${full.Text || ''} ${full.HTML || ''}`;
				const tok = body.match(/token=([a-f0-9]{64})/);
				if (tok) return tok[1];
			}
		}
		await new Promise((r) => setTimeout(r, delay));
	}
	throw new Error(`no "${subjectIncludes}" email for ${to} found in Mailpit`);
}

// ---- flows ---------------------------------------------------------------

async function run() {
	console.log(`\nTicketHub #7 e2e → ${BASE_URL}  (mail: ${MAILPIT_URL})\n`);

	// --- preflight: Mailpit reachable? ---
	try {
		await fetch(`${MAILPIT_URL}/api/v1/messages?limit=1`);
	} catch {
		console.error(
			`\n✖ Cannot reach Mailpit at ${MAILPIT_URL}.\n` +
				`  Run:  kubectl port-forward svc/mailpit-srv 8025:8025\n`,
		);
		process.exit(1);
	}

	const aliceEmail = email('alice');
	const bobEmail = email('bob');

	// ========================================================================
	console.log('SUITE 1 — Unverified user is blocked (negative paths)');
	// ========================================================================
	const aliceSignup = await api('/api/users/signup', {
		body: { email: aliceEmail, password: PASS },
	});
	is('signup returns 201', aliceSignup.status, 201);
	let aliceCookie = aliceSignup.cookie;
	is('new account starts unverified', aliceSignup.data?.emailVerified, false);

	const sellBlocked = await api('/api/tickets', {
		cookie: aliceCookie,
		body: { title: 'Blocked Listing', price: 50, venue: 'Nowhere' },
	});
	is('unverified CANNOT create a listing → 403', sellBlocked.status, 403);

	const orderBlocked = await api('/api/orders', {
		cookie: aliceCookie,
		body: { ticketId: '0'.repeat(24) },
	});
	is('unverified CANNOT create an order → 403', orderBlocked.status, 403);

	const payBlocked = await api('/api/payments', {
		cookie: aliceCookie,
		body: { orderId: '0'.repeat(24) },
	});
	is('unverified CANNOT start a payment → 403', payBlocked.status, 403);

	// ========================================================================
	console.log('\nSUITE 2 — Verify → can sell, buy, and pay (happy path)');
	// ========================================================================
	const aliceToken = await waitForToken(aliceEmail, 'Verify your email');
	check('verification email arrived in Mailpit', !!aliceToken);

	const aliceVerify = await api('/api/users/verify-email', {
		body: { token: aliceToken },
	});
	is('verify-email returns 200', aliceVerify.status, 200);
	is('user is now verified', aliceVerify.data?.emailVerified, true);
	aliceCookie = aliceVerify.cookie || aliceCookie; // refreshed cookie

	const whoAmI = await api('/api/users/currentuser', {
		method: 'GET',
		cookie: aliceCookie,
	});
	is('currentuser reflects emailVerified', whoAmI.data?.currentUser?.emailVerified, true);

	const sell = await api('/api/tickets', {
		cookie: aliceCookie,
		body: {
			title: `E2E Seat ${stamp}`,
			price: 42,
			venue: 'The O2, London',
			eventDate: new Date(Date.now() + 30 * 864e5).toISOString(),
			category: 'Concerts',
		},
	});
	is('verified user CAN create a listing → 201', sell.status, 201);
	const ticketId = sell.data?.id;

	// Buyer: signup + verify
	const bobSignup = await api('/api/users/signup', {
		body: { email: bobEmail, password: PASS },
	});
	let bobCookie = bobSignup.cookie;
	const bobToken = await waitForToken(bobEmail, 'Verify your email');
	const bobVerify = await api('/api/users/verify-email', { body: { token: bobToken } });
	bobCookie = bobVerify.cookie || bobCookie;
	is('second user verified', bobVerify.data?.emailVerified, true);

	const order = await api('/api/orders', {
		cookie: bobCookie,
		body: { ticketId },
	});
	is('verified buyer CAN create an order → 201', order.status, 201);
	const orderId = order.data?.id;

	const pay = await api('/api/payments', {
		cookie: bobCookie,
		body: { orderId },
	});
	is('verified buyer CAN start a payment → 201', pay.status, 201);
	check('payment intent returns a client secret', !!pay.data?.clientSecret);

	// ========================================================================
	console.log('\nSUITE 3 — Forgot → reset → sign in (happy path)');
	// ========================================================================
	const forgot = await api('/api/users/forgot-password', { body: { email: aliceEmail } });
	is('forgot-password returns 200', forgot.status, 200);

	const resetToken = await waitForToken(aliceEmail, 'Reset your password');
	check('reset email arrived in Mailpit', !!resetToken);

	const reset = await api('/api/users/reset-password', {
		body: { token: resetToken, password: 'newpass99' },
	});
	is('reset-password returns 200', reset.status, 200);

	const newLogin = await api('/api/users/signin', {
		body: { email: aliceEmail, password: 'newpass99' },
	});
	is('can sign in with the NEW password → 200', newLogin.status, 200);

	const oldLogin = await api('/api/users/signin', {
		body: { email: aliceEmail, password: PASS },
	});
	is('CANNOT sign in with the OLD password → 400', oldLogin.status, 400);

	const reuse = await api('/api/users/reset-password', {
		body: { token: resetToken, password: 'whatever' },
	});
	is('a used reset token is rejected → 400', reuse.status, 400);

	// ========================================================================
	console.log('\nSUITE 4 — Bad tokens & no email enumeration');
	// ========================================================================
	const badVerify = await api('/api/users/verify-email', { body: { token: 'nope' } });
	is('bogus verification token → 400', badVerify.status, 400);

	const badReset = await api('/api/users/reset-password', {
		body: { token: 'nope', password: 'abcd' },
	});
	is('bogus reset token → 400', badReset.status, 400);

	const unknown = await api('/api/users/forgot-password', {
		body: { email: `ghost+${stamp}@e2e.test` },
	});
	is('forgot-password for unknown email still → 200 (no enumeration)', unknown.status, 200);

	// --- summary ---
	console.log(`\n${'─'.repeat(52)}`);
	if (failures.length === 0) {
		console.log(`✓ ALL ${passed} checks passed.\n`);
		process.exit(0);
	} else {
		console.log(`✗ ${failures.length} of ${passed + failures.length} checks FAILED:\n`);
		failures.forEach((f) => console.log(`   • ${f}`));
		console.log('');
		process.exit(1);
	}
}

run().catch((err) => {
	console.error(`\n✖ e2e run crashed: ${err.message}\n`);
	process.exit(1);
});
