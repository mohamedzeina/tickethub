/**
 * #9 seller reviews — event replication + the authorization gates, end to end.
 *
 * The reviews service learns ticket->seller (ticket:created), the buyer + order
 * (order:created), and completion (payment:created). Black-box e2e can reserve
 * an order (status `created`) but can't settle Stripe (no card confirmation /
 * webhook), so it can't drive an order to `complete`. We therefore verify here:
 *   • the replication pipeline (the seller is resolved for a buyer's order), and
 *   • every gate that DOESN'T need completion (auth, ownership, not-complete,
 *     unknown order, validation, the public aggregate endpoint).
 * The full "complete order -> review -> shows in seller aggregate" path is
 * covered by the reviews service unit tests, which seed a completed order.
 *
 * Part of the suite (`node e2e/run-all.js`) or standalone (`node e2e/reviews.js`).
 */

const h = require('./lib/harness');

async function run(t) {
	t.suite('SUITE 1 — order replicates into reviews with its seller resolved');
	const seller = await h.signupVerified('rev-seller');
	const buyer = await h.signupVerified('rev-buyer');

	const listing = await h.createListing(seller.cookie, { title: 'Reviews E2E Show' });
	t.is('verified seller creates a listing → 201', listing.status, 201);
	const ticketId = listing.data?.id;
	const sellerId = listing.data?.userId;
	t.check('listing carries the seller userId', !!sellerId, 'no userId on listing');

	const order = await h.reserveReady(buyer.cookie, ticketId);
	t.is('verified buyer reserves it → 201', order.status, 201);
	const orderId = order.data?.id;

	// reviews keeps its own order replica fed by order:created; give it a beat.
	const stateRes = await h.retry(
		() => h.api(`/api/reviews/order/${orderId}`, { method: 'GET', cookie: buyer.cookie }),
		{ tries: 20, delay: 400, until: (r) => r.status === 200 },
	);
	t.is('buyer can read the order review-state → 200', stateRes.status, 200);
	t.is('a freshly reserved order is not yet reviewable', stateRes.data?.reviewable, false);
	t.is('reviews resolved the correct seller for the order', stateRes.data?.sellerId, sellerId);
	t.is('no review exists yet', stateRes.data?.review, null);

	t.suite('SUITE 2 — review creation is gated (auth, ownership, completion)');
	const unauth = await h.api('/api/reviews', { body: { orderId, rating: 5 } });
	t.is('unauthenticated review → 401', unauth.status, 401);

	const notBuyer = await h.api('/api/reviews', {
		cookie: seller.cookie,
		body: { orderId, rating: 5 },
	});
	t.is('a non-buyer (the seller) cannot review the order → 401', notBuyer.status, 401);

	const notComplete = await h.api('/api/reviews', {
		cookie: buyer.cookie,
		body: { orderId, rating: 5 },
	});
	t.is('buyer cannot review an order that is not complete → 400', notComplete.status, 400);

	const unknown = await h.api('/api/reviews', {
		cookie: buyer.cookie,
		body: { orderId: h.MISSING_ID, rating: 5 },
	});
	t.is('review for an unknown order → 404', unknown.status, 404);

	const badRating = await h.api('/api/reviews', {
		cookie: buyer.cookie,
		body: { orderId, rating: 9 },
	});
	t.is('out-of-range rating → 400', badRating.status, 400);

	t.suite('SUITE 3 — public seller reputation endpoint');
	const pub = await h.api(`/api/reviews/seller/${sellerId}`, { method: 'GET' });
	t.is('seller reputation is public (no auth) → 200', pub.status, 200);
	t.is('a seller with no completed reviews shows count 0', pub.data?.summary?.count, 0);
	t.is('average is 0 with no reviews', pub.data?.summary?.average, 0);
	t.check('an opaque seller handle is exposed', /^Seller /.test(pub.data?.handle || ''),
		`handle was ${pub.data?.handle}`);
	t.check('the raw email is never exposed', !JSON.stringify(pub.data).includes('@'),
		'response contained an @, possible email leak');
}

module.exports = run;

if (require.main === module) {
	h.runStandalone(run, { needsMail: true });
}
