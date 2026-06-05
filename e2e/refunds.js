/**
 * Refund v1 (#6 tail) — the buyer-initiated, webhook-confirmed refund flow, end
 * to end. The ONE suite that settles a real Stripe test payment, so it can
 * exercise the paid → refund path the other suites stub out.
 *
 * Flow: a verified buyer reserves a verified seller's ticket and starts payment;
 * we SETTLE the PaymentIntent with a Stripe test card via the authenticated
 * Stripe CLI (`stripe payment_intents confirm … payment_method=pm_card_visa`),
 * which fires payment_intent.succeeded — forwarded to the cluster webhook by the
 * already-running `stripe listen`. Once the order reflects the payment, the buyer
 * requests a refund via `POST /api/orders/:id/refund`. Payments creates the Stripe
 * refund and only publishes payment:refunded once the `charge.refunded` webhook
 * confirms it settled — which flips the order to Refunded and cascades (ticket
 * relisted, review soft-hidden, pass revoked, refund email).
 *
 * SUITE 1 asserts: receipt email lands (settle worked), the order flips to
 * Refunded, a refund email + in-app notification land, and the buyer's review is
 * soft-hidden from the seller's reputation (Option A).
 * SUITE 2 asserts the window guard: a paid order whose event is inside the
 * event-cutoff is NOT refundable — POST /refund → 400.
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

// Reserve → pay → settle → wait until the order reflects the payment. Returns the
// orderId once the order is Complete, or null if any step failed (already
// asserted). The order being Complete implies payments recorded the Payment (it
// publishes payment:created only after), so a refund request can find the charge.
async function buyAndSettle(t, buyer, ticketId, label) {
	const order = await h.reserveReady(buyer.cookie, ticketId);
	t.is(`${label}: buyer reserves the ticket → 201`, order.status, 201);
	const orderId = order.data?.id;
	if (!orderId) return null;

	const pay = await h.payIntent(buyer.cookie, orderId);
	t.is(`${label}: buyer creates a PaymentIntent → 201`, pay.status, 201);
	const clientSecret = pay.data?.clientSecret;
	if (!clientSecret) return null;

	try {
		settlePaymentIntent(clientSecret);
	} catch (err) {
		const detail = (err.stderr?.toString() || err.message || '').slice(0, 300);
		t.check(`${label}: settle PaymentIntent via Stripe CLI`, false, detail);
		return null;
	}

	// Wait for the webhook to flip the order to Complete.
	const done = await h.retry(
		() => h.api(`/api/orders/${orderId}`, { method: 'GET', cookie: buyer.cookie }),
		{
			tries: 40,
			delay: 500,
			until: (r) => r.status === 200 && r.data?.status === 'complete',
		},
	);
	const ok = t.is(`${label}: order is Complete after settle`, done.data?.status, 'complete');
	return ok ? orderId : null;
}

async function run(t) {
	t.suite('SUITE 1 — Buyer refund: status flips, email, notification, review hidden');

	const seller = await h.signupVerified('refund-seller');
	const buyer = await h.signupVerified('refund-buyer');

	const listing = await h.createListing(seller.cookie, {
		title: `Refund Seat ${Date.now()}`,
		price: 55,
	});
	t.is('verified seller creates a listing → 201', listing.status, 201);
	const ticketId = listing.data?.id;

	const orderId = await buyAndSettle(t, buyer, ticketId, 'happy');
	if (!orderId) return; // no paid order → nothing to refund

	// Receipt email confirms the settle path emailed the buyer (sanity check
	// that the existing transactional email still fires).
	const receipts = await h.retry(() => h.countMail(buyer.email, 'receipt'), {
		tries: 20,
		delay: 500,
		until: (n) => n >= 1,
	});
	t.check('a receipt email was sent to the buyer', receipts >= 1);

	// Buyer leaves a review on the paid order — so we can prove the refund
	// soft-hides it from the seller's reputation (Option A). Retry while reviews'
	// order replica catches up to Complete (the create route gates on it).
	const review = await h.retry(
		() =>
			h.api('/api/reviews', {
				cookie: buyer.cookie,
				body: { orderId, rating: 5, comment: 'Great seats, smooth handoff.' },
			}),
		{ tries: 20, delay: 500, until: (r) => r.status === 201 },
	);
	t.is('buyer reviews the paid order → 201', review.status, 201);

	const before = await h.retry(
		() => h.api(`/api/reviews/seller/${seller.userId}`, { method: 'GET' }),
		{ tries: 20, delay: 400, until: (r) => r.status === 200 && r.data?.summary?.count >= 1 },
	);
	t.is('seller reputation shows the review before refund', before.data?.summary?.count, 1);

	// The order should report itself refundable before we request (event is 30d
	// out, well inside the window).
	const refundable = await h.api(`/api/orders/${orderId}`, { method: 'GET', cookie: buyer.cookie });
	t.is('paid order reports refundable=true', refundable.data?.refundable, true);

	// The thing under test: request the refund.
	const refundReq = await h.api(`/api/orders/${orderId}/refund`, {
		method: 'POST',
		cookie: buyer.cookie,
	});
	t.is('buyer requests a refund → 200', refundReq.status, 200);
	t.check('refund request stamps refundRequestedAt', !!refundReq.data?.refundRequestedAt);

	// Stripe's charge.refunded webhook confirms it → orders flips to Refunded.
	const refunded = await h.retry(
		() => h.api(`/api/orders/${orderId}`, { method: 'GET', cookie: buyer.cookie }),
		{
			tries: 40,
			delay: 500,
			until: (r) => r.status === 200 && r.data?.status === 'refunded',
		},
	);
	t.is('order status becomes Refunded after the webhook confirms', refunded.data?.status, 'refunded');

	// The refund confirmation email.
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

	// Option A: the refund soft-hides the buyer's review, so the seller's
	// reputation drops it. Cascade is async (order:cancelled → reviews), so retry.
	const after = await h.retry(
		() => h.api(`/api/reviews/seller/${seller.userId}`, { method: 'GET' }),
		{ tries: 30, delay: 500, until: (r) => r.status === 200 && r.data?.summary?.count === 0 },
	);
	t.is('refunded order’s review is hidden from seller reputation', after.data?.summary?.count, 0);

	t.suite('SUITE 2 — Refund window guard: an event inside the cutoff is not refundable');

	// A listing whose event is ~1 day out is already inside the 48h event cutoff,
	// so the order is non-refundable the moment it's paid.
	const soonListing = await h.createListing(seller.cookie, {
		title: `Last-Minute Seat ${Date.now()}`,
		price: 40,
		eventDate: h.futureDate(1),
	});
	t.is('seller creates a last-minute listing → 201', soonListing.status, 201);

	const soonOrderId = await buyAndSettle(t, buyer, soonListing.data?.id, 'window');
	if (soonOrderId) {
		const soonOrder = await h.api(`/api/orders/${soonOrderId}`, {
			method: 'GET',
			cookie: buyer.cookie,
		});
		t.is('last-minute paid order reports refundable=false', soonOrder.data?.refundable, false);

		const rejected = await h.api(`/api/orders/${soonOrderId}/refund`, {
			method: 'POST',
			cookie: buyer.cookie,
		});
		t.is('refund outside the window is rejected → 400', rejected.status, 400);
		t.check(
			'rejection explains the window has passed',
			/window/i.test(rejected.data?.errors?.[0]?.message || ''),
		);
	}
}

module.exports = run;

if (require.main === module) {
	h.runStandalone(run, { needsMail: true });
}
