/**
 * payments — PaymentIntent creation, end to end.
 *
 * Scope: POST /api/payments only. We assert up to PaymentIntent creation
 * (201 + clientSecret). Webhook settlement (payment_intent.succeeded → Payment
 * record → order Complete) needs a real Stripe signature and CANNOT be driven
 * from here, so it is intentionally OUT OF SCOPE.
 *
 * Full precondition chain per sale: a verified seller lists a ticket, a distinct
 * verified buyer reserves it (orders → payments replica lags, so payIntent
 * retries on 404), then the buyer pays.
 *
 * Part of the suite (`node e2e/run-all.js`) or standalone (`node e2e/payments.js`).
 * signupVerified reads Mailpit for the verification token, so needsMail = true.
 */

const h = require('./lib/harness');

// Reserve `seller`'s freshly-listed ticket as `buyer`; returns the order.
async function newOrder(seller, buyer) {
	const listing = await h.createListing(seller.cookie, { title: `Pay Seat ${h.uniqueEmail('x')}` });
	const order = await h.reserve(buyer.cookie, listing.data?.id);
	return order;
}

async function run(t) {
	t.suite('SUITE 1 — Create PaymentIntent (happy path)');
	const seller = await h.signupVerified('pay-seller');
	const buyer = await h.signupVerified('pay-buyer');
	t.check('two distinct verified actors created', !!seller.userId && !!buyer.userId && seller.userId !== buyer.userId);

	const order = await newOrder(seller, buyer);
	t.is('verified buyer reserves the ticket → 201', order.status, 201);
	const orderId = order.data?.id;

	const pay = await h.payIntent(buyer.cookie, orderId);
	t.is('owner pays their order → 201', pay.status, 201);
	t.check('response carries a clientSecret', !!pay.data?.clientSecret);
	t.check('clientSecret looks like a Stripe secret (contains _secret_)', /_secret_/.test(pay.data?.clientSecret || ''));

	t.suite('SUITE 2 — Idempotency: double-submit returns a secret each time');
	const payAgain = await h.api('/api/payments', { cookie: buyer.cookie, body: { orderId } });
	t.is('second pay for the same order → 201', payAgain.status, 201);
	t.check('second response also carries a clientSecret', !!payAgain.data?.clientSecret);
	// Stripe idempotencyKey=orderId returns the SAME PaymentIntent, so the
	// PaymentIntent id (the prefix before _secret_) must match across calls.
	const piId = (s) => String(s || '').split('_secret_')[0];
	t.is('idempotent: same PaymentIntent id both times', piId(payAgain.data?.clientSecret), piId(pay.data?.clientSecret));

	t.suite('SUITE 3 — Auth & verification gates');
	const noAuth = await h.api('/api/payments', { body: { orderId } });
	t.is('no cookie → 401', noAuth.status, 401);

	const unverified = await h.signup('pay-unverified');
	const unverifiedPay = await h.api('/api/payments', { cookie: unverified.cookie, body: { orderId } });
	t.is('unverified user → 403', unverifiedPay.status, 403);

	t.suite('SUITE 4 — Authorization & order state (negative paths)');
	// A second buyer must NOT be able to pay an order they do not own.
	const intruder = await h.signupVerified('pay-intruder');
	const intruderPay = await h.retry(
		() => h.api('/api/payments', { cookie: intruder.cookie, body: { orderId } }),
		{ tries: 15, delay: 400, until: (r) => r.status !== 404 },
	);
	t.is("paying someone else's order → 401", intruderPay.status, 401);

	const notFound = await h.api('/api/payments', { cookie: buyer.cookie, body: { orderId: '0'.repeat(24) } });
	t.is('non-existent order → 404', notFound.status, 404);

	const missing = await h.api('/api/payments', { cookie: buyer.cookie, body: {} });
	t.is('missing orderId → 400', missing.status, 400);

	// Cancelled order: reserve a fresh ticket, cancel it, then try to pay.
	const cancelOrder = await newOrder(seller, buyer);
	t.is('reserve order to cancel → 201', cancelOrder.status, 201);
	const cancelId = cancelOrder.data?.id;
	const cancel = await h.api(`/api/orders/${cancelId}`, { method: 'DELETE', cookie: buyer.cookie });
	t.is('cancel the order → 204', cancel.status, 204);

	// order:cancelled propagates to the payments replica; poll until pay reflects it.
	const cancelledPay = await h.retry(
		() => h.api('/api/payments', { cookie: buyer.cookie, body: { orderId: cancelId } }),
		{ tries: 20, delay: 400, until: (r) => r.status === 400 },
	);
	t.is('paying a cancelled order → 400', cancelledPay.status, 400);
}

module.exports = run;

if (require.main === module) {
	h.runStandalone(run, { needsMail: true });
}
