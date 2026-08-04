/**
 * #9 follow-up — per-card seller ratings, end to end.
 *
 * The browse/search grid shows a star badge per listing, batch-resolved from the
 * reviews service via `GET /api/reviews/sellers?ids=a,b,c` (no N+1). This suite
 * proves that endpoint against a LIVE cluster with a REAL review on the books —
 * which means settling a Stripe test payment so an order reaches Complete (the
 * review-create gate), the same technique refunds.js uses.
 *
 * Asserts:
 *   • a rated seller appears in the batch with the correct {average, count},
 *     matching the single-seller aggregate (consistency),
 *   • a seller with a listing but no reviews is omitted (so a new seller never
 *     reads as a zero-star one), and
 *   • the endpoint is public and degrades on empty/junk ids rather than 400ing.
 *
 * REQUIRES `stripe listen` + the Stripe CLI authenticated (same as refunds.js);
 * the settle step fails loudly rather than passing silently.
 *
 * Part of the suite (`node e2e/run-all.js`) or standalone (`node e2e/per-card-ratings.js`).
 */

const h = require('./lib/harness');

async function run(t) {
	t.suite('SUITE 1 — a rated seller surfaces in the batch ratings endpoint');

	const seller = await h.signupVerified('pcr-seller');
	const freshSeller = await h.signupVerified('pcr-fresh');
	const buyer = await h.signupVerified('pcr-buyer');

	const listing = await h.createListing(seller.cookie, {
		title: `Per-Card Seat ${Date.now()}`,
		price: 42,
	});
	t.is('verified seller creates a listing → 201', listing.status, 201);
	const ticketId = listing.data?.id;
	const sellerId = listing.data?.userId;

	// A second seller with a live listing but no reviews — must be omitted, not
	// shown as zero stars.
	const freshListing = await h.createListing(freshSeller.cookie, {
		title: `Unreviewed Seat ${Date.now()}`,
		price: 30,
	});
	t.is('a second seller creates a listing → 201', freshListing.status, 201);
	const freshSellerId = freshListing.data?.userId;

	const orderId = await h.buyAndSettle(t, buyer, ticketId, 'rated');
	if (!orderId) return; // can't review without a Complete order

	// Buyer reviews the paid order (rating 4). Retry while reviews' order replica
	// catches up to Complete (the create route gates on it).
	const review = await h.retry(
		() =>
			h.api('/api/reviews', {
				cookie: buyer.cookie,
				body: { orderId, rating: 4, comment: 'Solid seats, easy entry.' },
			}),
		{ tries: 20, delay: 500, until: (r) => r.status === 201 },
	);
	t.is('buyer reviews the paid order → 201', review.status, 201);

	// The batch endpoint should now reflect the review for this seller.
	const batch = await h.retry(
		() =>
			h.api(`/api/reviews/sellers?ids=${sellerId},${freshSellerId}`, {
				method: 'GET',
			}),
		{
			tries: 20,
			delay: 400,
			until: (r) =>
				r.status === 200 &&
				Array.isArray(r.data) &&
				r.data.some((s) => s.sellerId === sellerId && s.summary?.count >= 1),
		},
	);
	t.is('batch ratings endpoint is public (no auth) → 200', batch.status, 200);
	t.check('batch response is an array', Array.isArray(batch.data), `got ${typeof batch.data}`);

	const byId = Object.fromEntries((batch.data || []).map((s) => [s.sellerId, s.summary]));
	t.is('the rated seller has count 1 in the batch', byId[sellerId]?.count, 1);
	t.is('the rated seller has the right average in the batch', byId[sellerId]?.average, 4);
	t.check(
		'a seller with a listing but no reviews is omitted from the batch',
		!(freshSellerId in byId),
		`freshSeller unexpectedly present: ${JSON.stringify(byId[freshSellerId])}`,
	);

	// Consistency: the batch summary matches the single-seller aggregate.
	const single = await h.api(`/api/reviews/seller/${sellerId}`, { method: 'GET' });
	t.is('single-seller aggregate agrees on count', single.data?.summary?.count, byId[sellerId]?.count);
	t.is('single-seller aggregate agrees on average', single.data?.summary?.average, byId[sellerId]?.average);

	t.suite('SUITE 2 — the batch endpoint degrades on empty/junk ids');

	const empty = await h.api('/api/reviews/sellers', { method: 'GET' });
	t.is('no ids → 200', empty.status, 200);
	t.check('no ids → empty array', Array.isArray(empty.data) && empty.data.length === 0,
		`got ${JSON.stringify(empty.data)}`);

	const junk = await h.api('/api/reviews/sellers?ids=not-an-id,also-junk', { method: 'GET' });
	t.is('junk ids → 200 (no 400)', junk.status, 200);
	t.check('junk ids → empty array (degrades)', Array.isArray(junk.data) && junk.data.length === 0,
		`got ${JSON.stringify(junk.data)}`);
}

module.exports = run;

if (require.main === module) {
	h.runStandalone(run, { needsMail: true });
}
