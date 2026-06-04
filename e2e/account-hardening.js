/**
 * #7 account hardening — email verification + password reset, end to end.
 * Negative paths (unverified blocked from list/order/pay) + happy paths
 * (verify → sell/buy/pay; forgot → reset → sign in). Tokens come from Mailpit.
 *
 * Part of the suite (`node e2e/run-all.js`) or standalone (`node e2e/account-hardening.js`).
 */

const h = require('./lib/harness');

async function run(t) {
	const stamp = Date.now();
	const aliceEmail = `alice+${stamp}@e2e.test`;
	const bobEmail = `bob+${stamp}@e2e.test`;
	const PASS = `Pw-${stamp}-a`;
	const NEW_PASS = `Pw-${stamp}-b`;
	const BOGUS = `not-a-valid-token-${stamp}`;

	t.suite('SUITE 1 — Unverified user is blocked (negative paths)');
	const aliceSignup = await h.api('/api/users/signup', {
		body: { email: aliceEmail, password: PASS },
	});
	t.is('signup returns 201', aliceSignup.status, 201);
	let aliceCookie = aliceSignup.cookie;
	t.is('new account starts unverified', aliceSignup.data?.emailVerified, false);

	const sellBlocked = await h.api('/api/tickets', {
		cookie: aliceCookie,
		body: { title: 'Blocked', price: 50, venue: 'Nowhere' },
	});
	t.is('unverified CANNOT create a listing → 403', sellBlocked.status, 403);

	const orderBlocked = await h.api('/api/orders', {
		cookie: aliceCookie,
		body: { ticketId: '0'.repeat(24) },
	});
	t.is('unverified CANNOT create an order → 403', orderBlocked.status, 403);

	const payBlocked = await h.api('/api/payments', {
		cookie: aliceCookie,
		body: { orderId: '0'.repeat(24) },
	});
	t.is('unverified CANNOT start a payment → 403', payBlocked.status, 403);

	t.suite('SUITE 2 — Verify → can sell, buy, and pay (happy path)');
	const aliceToken = await h.waitForMailToken(aliceEmail, 'Verify your email');
	t.check('verification email arrived in Mailpit', !!aliceToken);

	const aliceVerify = await h.api('/api/users/verify-email', { body: { token: aliceToken } });
	t.is('verify-email returns 200', aliceVerify.status, 200);
	t.is('user is now verified', aliceVerify.data?.emailVerified, true);
	aliceCookie = aliceVerify.cookie || aliceCookie;

	const whoAmI = await h.api('/api/users/currentuser', { method: 'GET', cookie: aliceCookie });
	t.is('currentuser reflects emailVerified', whoAmI.data?.currentUser?.emailVerified, true);

	const sell = await h.createListing(aliceCookie, { title: `E2E Seat ${stamp}` });
	t.is('verified user CAN create a listing → 201', sell.status, 201);
	const ticketId = sell.data?.id;

	const bobSignup = await h.api('/api/users/signup', {
		body: { email: bobEmail, password: PASS },
	});
	let bobCookie = bobSignup.cookie;
	const bobToken = await h.waitForMailToken(bobEmail, 'Verify your email');
	const bobVerify = await h.api('/api/users/verify-email', { body: { token: bobToken } });
	bobCookie = bobVerify.cookie || bobCookie;
	t.is('second user verified', bobVerify.data?.emailVerified, true);

	const order = await h.reserve(bobCookie, ticketId);
	t.is('verified buyer CAN create an order → 201', order.status, 201);

	const pay = await h.payIntent(bobCookie, order.data?.id);
	t.is('verified buyer CAN start a payment → 201', pay.status, 201);
	t.check('payment intent returns a client secret', !!pay.data?.clientSecret);

	t.suite('SUITE 3 — Forgot → reset → sign in (happy path)');
	const forgot = await h.api('/api/users/forgot-password', { body: { email: aliceEmail } });
	t.is('forgot-password returns 200', forgot.status, 200);

	const resetToken = await h.waitForMailToken(aliceEmail, 'Reset your password');
	t.check('reset email arrived in Mailpit', !!resetToken);

	const reset = await h.api('/api/users/reset-password', {
		body: { token: resetToken, password: NEW_PASS },
	});
	t.is('reset-password returns 200', reset.status, 200);

	const newLogin = await h.api('/api/users/signin', {
		body: { email: aliceEmail, password: NEW_PASS },
	});
	t.is('can sign in with the NEW password → 200', newLogin.status, 200);

	const oldLogin = await h.api('/api/users/signin', {
		body: { email: aliceEmail, password: PASS },
	});
	t.is('CANNOT sign in with the OLD password → 400', oldLogin.status, 400);

	const reuse = await h.api('/api/users/reset-password', {
		body: { token: resetToken, password: NEW_PASS },
	});
	t.is('a used reset token is rejected → 400', reuse.status, 400);

	t.suite('SUITE 4 — Bad tokens & no email enumeration');
	const badVerify = await h.api('/api/users/verify-email', { body: { token: BOGUS } });
	t.is('bogus verification token → 400', badVerify.status, 400);

	const badReset = await h.api('/api/users/reset-password', {
		body: { token: BOGUS, password: PASS },
	});
	t.is('bogus reset token → 400', badReset.status, 400);

	const unknown = await h.api('/api/users/forgot-password', {
		body: { email: `ghost+${stamp}@e2e.test` },
	});
	t.is('forgot-password for unknown email still → 200 (no enumeration)', unknown.status, 200);
}

module.exports = run;

if (require.main === module) {
	h.runStandalone(run, { needsMail: true });
}
