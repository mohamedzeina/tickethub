/**
 * Cross-service purchase lifecycle, end to end through the public API.
 *
 * Full journey: verified seller lists → ticket appears in catalog/search →
 * second verified buyer reserves (201) → ticket becomes unavailable to a THIRD
 * user (replica) → buyer creates a PaymentIntent (201) → an in-app notification
 * lands for the buyer (event-driven). Plus the cancel path: buyer cancels →
 * ticket becomes reservable again by another user (replica).
 *
 * Out of scope (NOT waited on here): the 15-minute hold expiration timer and
 * Stripe webhook settlement (needs a real signed webhook). We assert only up to
 * PaymentIntent creation (201 + clientSecret).
 *
 * Part of the suite (`node e2e/run-all.js`) or standalone (`node e2e/flows.js`).
 */

const h = require('./lib/harness');

async function run(t) {
	const stamp = Date.now();
	const title = `Lifecycle Seat ${stamp}`;

	t.suite('SUITE 1 — Verified seller lists a ticket');
	const seller = await h.signupVerified('seller');
	t.is('seller signed up and verified', seller.verified, true);

	const listing = await h.createListing(seller.cookie, { title, price: 99 });
	t.is('verified seller CAN create a listing → 201', listing.status, 201);
	const ticketId = listing.data?.id;
	t.check('listing returns a ticket id', !!ticketId);
	t.is('new listing is not reserved (no orderId)', listing.data?.orderId, undefined);

	t.suite('SUITE 2 — Listing appears in catalog and search');
	const show = await h.api(`/api/tickets/${ticketId}`, { method: 'GET' });
	t.is('GET /api/tickets/:id returns the listing → 200', show.status, 200);
	t.is('shown ticket id matches', show.data?.id, ticketId);

	// The unique title isolates our listing from seed data; poll in case the
	// tickets index is read off a lagging read model.
	const search = await h.retry(
		() => h.api(`/api/tickets?q=${encodeURIComponent(title)}`, { method: 'GET' }),
		{ tries: 15, delay: 400, until: (r) => (r.data?.tickets || []).some((x) => x.id === ticketId) },
	);
	t.is('search by title returns 200', search.status, 200);
	t.check(
		'search surfaces our listing in the catalog',
		(search.data?.tickets || []).some((x) => x.id === ticketId),
	);

	t.suite('SUITE 3 — A second verified buyer reserves it');
	const buyer = await h.signupVerified('buyer');
	t.is('buyer signed up and verified', buyer.verified, true);

	const order = await h.reserveReady(buyer.cookie, ticketId);
	t.is('verified buyer CAN reserve the ticket → 201', order.status, 201);
	const orderId = order.data?.id;
	t.check('order returns an id', !!orderId);
	t.is('order starts in Created status', order.data?.status, 'created');
	t.is('reserved order carries the ticket', order.data?.ticket?.id, ticketId);

	t.suite('SUITE 4 — Reserved ticket is unavailable to a THIRD user');
	const third = await h.signupVerified('third');

	// The reservation propagates to orders/tickets read models via the
	// order:created → ticket:updated chain; poll instead of asserting instantly.
	const reReserve = await h.retry(() => h.reserve(third.cookie, ticketId), {
		tries: 20,
		delay: 400,
		until: (r) => r.status === 400,
	});
	t.is('third user CANNOT reserve the held ticket → 400', reReserve.status, 400);

	const gone = await h.retry(
		() => h.api(`/api/tickets?q=${encodeURIComponent(title)}`, { method: 'GET' }),
		{ tries: 20, delay: 400, until: (r) => !(r.data?.tickets || []).some((x) => x.id === ticketId) },
	);
	t.check(
		'reserved ticket drops out of the catalog index',
		!(gone.data?.tickets || []).some((x) => x.id === ticketId),
	);

	t.suite('SUITE 5 — Buyer creates a PaymentIntent');
	const pay = await h.payIntent(buyer.cookie, orderId);
	t.is('buyer CAN create a PaymentIntent → 201', pay.status, 201);
	t.check('PaymentIntent returns a client secret', !!pay.data?.clientSecret);
	// Webhook settlement (order → Complete) is out of scope: it needs a real
	// Stripe signature and cannot be driven from here.

	t.suite('SUITE 6 — Buyer gets an in-app notification (event-driven)');
	// The order:created event seeds an OrderCreated notification in the buyer's
	// feed; poll the feed until it shows up.
	const feed = await h.retry(
		() => h.api('/api/notifications', { method: 'GET', cookie: buyer.cookie }),
		{
			tries: 25,
			delay: 500,
			until: (r) => (r.data?.notifications || []).some((n) => n.orderId === orderId),
		},
	);
	t.is('notification feed returns 200', feed.status, 200);
	t.check(
		'buyer has an in-app notification for this order',
		(feed.data?.notifications || []).some((n) => n.orderId === orderId),
	);

	t.suite('SUITE 7 — Cancel releases the ticket for someone else');
	// The PaymentIntent above publishes payment:initiated, which moves the order
	// Created→AwaitingPayment. If that bump lands mid-cancel, the cancel's save
	// loses an optimistic-concurrency race (VersionError → 400). It's transient —
	// a reload+save succeeds — so retry the cancel, as a real client would.
	const cancel = await h.retry(
		() => h.api(`/api/orders/${orderId}`, { method: 'DELETE', cookie: buyer.cookie }),
		{ tries: 10, delay: 400, until: (r) => r.status === 204 },
	);
	t.is('buyer CAN cancel the order → 204', cancel.status, 204);

	// The order:cancelled → ticket:updated chain frees the reservation; poll
	// until the third user can reserve, rather than racing the replica.
	const reReserved = await h.retry(() => h.reserve(third.cookie, ticketId), {
		tries: 25,
		delay: 500,
		until: (r) => r.status === 201,
	});
	t.is('third user CAN reserve once the hold is released → 201', reReserved.status, 201);
	t.check('the released reservation produced a fresh order', !!reReserved.data?.id);
}

module.exports = run;

if (require.main === module) {
	h.runStandalone(run, { needsMail: true });
}
