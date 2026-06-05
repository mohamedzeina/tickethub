/**
 * #6 tail — refund confirmation email, end to end. The ONE suite that settles a
 * real Stripe test payment, so it can exercise the paid → refund path the other
 * suites stub out.
 *
 * Flow: a verified buyer reserves a verified seller's ticket and starts payment;
 * we SETTLE the PaymentIntent with a Stripe test card via the authenticated
 * Stripe CLI (`stripe payment_intents confirm … payment_method=pm_card_visa`),
 * which fires payment_intent.succeeded — forwarded to the cluster webhook by the
 * already-running `stripe listen`. Once the payment lands (the PaymentSucceeded
 * notification + receipt email appear), the buyer cancels the PAID order, which
 * refunds the charge (payment:refunded) and triggers the refund email +
 * PaymentRefunded notification under test.
 *
 * Asserts: receipt email lands (settle worked), refund email lands (the #6-tail
 * feature), and the in-app "Refund issued" notification appears.
 *
 * REQUIRES `stripe listen` running and the Stripe CLI authenticated to the same
 * (test) account as the payments service. If the CLI/listen isn't available the
 * settle step fails loudly rather than silently passing.
 *
 * Part of the suite (`node e2e/run-all.js`) or standalone (`node e2e/refunds.js`).
 */

const h = require('./lib/harness');
const { execFileSync } = require('child_process');

// Settle a PaymentIntent with a Stripe test card via the authenticated Stripe
// CLI. The clientSecret is `pi_xxx_secret_yyy`; the intent id is the prefix.
function settlePaymentIntent(clientSecret) {
	const intentId = clientSecret.split('_secret_')[0];
	execFileSync(
		'stripe',
		['payment_intents', 'confirm', intentId, '-d', 'payment_method=pm_card_visa'],
		{ stdio: 'pipe' },
	);
	return intentId;
}

async function run(t) {
	t.suite('SUITE 1 — Refund email after a settled payment is cancelled');

	const seller = await h.signupVerified('refund-seller');
	const buyer = await h.signupVerified('refund-buyer');

	const listing = await h.createListing(seller.cookie, {
		title: `Refund Seat ${Date.now()}`,
		price: 55,
	});
	t.is('verified seller creates a listing → 201', listing.status, 201);
	const ticketId = listing.data?.id;

	const order = await h.reserveReady(buyer.cookie, ticketId);
	t.is('verified buyer reserves the ticket → 201', order.status, 201);
	const orderId = order.data?.id;

	const pay = await h.payIntent(buyer.cookie, orderId);
	t.is('buyer creates a PaymentIntent → 201', pay.status, 201);
	const clientSecret = pay.data?.clientSecret;
	t.check('PaymentIntent returns a client secret', !!clientSecret);
	if (!clientSecret) return;

	// Settle with a test card (fires payment_intent.succeeded → webhook).
	let settled = false;
	try {
		settlePaymentIntent(clientSecret);
		settled = true;
	} catch (err) {
		const detail = (err.stderr?.toString() || err.message || '').slice(0, 300);
		t.check('settle PaymentIntent via Stripe CLI', false, detail);
	}
	t.check('settled the PaymentIntent with a Stripe test card', settled);
	if (!settled) return; // no paid order → nothing to refund

	// Wait for the webhook to land. The PaymentSucceeded notification proves the
	// payments service recorded the Payment (the refund gate) AND notifications
	// processed payment:created — so it's safe to cancel and expect a refund.
	const paidFeed = await h.retry(
		() => h.api('/api/notifications', { method: 'GET', cookie: buyer.cookie }),
		{
			tries: 40,
			delay: 500,
			until: (r) =>
				r.status === 200 &&
				(r.data?.notifications || []).some(
					(n) => n.orderId === orderId && n.type === 'payment_succeeded',
				),
		},
	);
	const paidOk = (paidFeed.data?.notifications || []).some(
		(n) => n.orderId === orderId && n.type === 'payment_succeeded',
	);
	t.check('payment settled — PaymentSucceeded notification appeared', paidOk);
	if (!paidOk) return; // webhook didn't land (is `stripe listen` running?)

	// Receipt email confirms the settle path emailed the buyer (sanity check
	// that the existing transactional email still fires).
	const receipts = await h.retry(() => h.countMail(buyer.email, 'receipt'), {
		tries: 20,
		delay: 500,
		until: (n) => n >= 1,
	});
	t.check('a receipt email was sent to the buyer', receipts >= 1);

	// Buyer cancels the PAID order → payments refunds → payment:refunded.
	const cancel = await h.api(`/api/orders/${orderId}`, {
		method: 'DELETE',
		cookie: buyer.cookie,
	});
	t.is('buyer cancels the paid order → 204', cancel.status, 204);

	// The thing under test: the refund confirmation email.
	const refunds = await h.retry(() => h.countMail(buyer.email, 'refund'), {
		tries: 40,
		delay: 500,
		until: (n) => n >= 1,
	});
	t.check('a refund confirmation email was sent to the buyer', refunds >= 1);

	// …and the in-app "Refund issued" notification lands too.
	const refundFeed = await h.retry(
		() => h.api('/api/notifications', { method: 'GET', cookie: buyer.cookie }),
		{
			tries: 40,
			delay: 500,
			until: (r) =>
				r.status === 200 &&
				(r.data?.notifications || []).some(
					(n) => n.orderId === orderId && n.type === 'payment_refunded',
				),
		},
	);
	const refundNote = (refundFeed.data?.notifications || []).find(
		(n) => n.orderId === orderId && n.type === 'payment_refunded',
	);
	t.check('an in-app refund notification appeared', !!refundNote);
	t.is('refund notification title is "Refund issued"', refundNote?.title, 'Refund issued');
}

module.exports = run;

if (require.main === module) {
	h.runStandalone(run, { needsMail: true });
}
