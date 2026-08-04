/**
 * Reservations (orders) — live end to end.
 *
 * Covers POST /api/orders (reserve), GET /api/orders, GET /api/orders/:id,
 * and DELETE /api/orders/:id: happy paths plus auth, ownership, self-purchase,
 * double-reservation, unlisted and non-existent ticket guards. A separate
 * verified seller lists the ticket; a second verified user buys it. Settlement
 * (the Stripe webhook) is out of scope — we assert only up to order/cancel state.
 *
 * Part of the suite (`node e2e/run-all.js`) or standalone (`node e2e/orders.js`).
 */

const h = require('./lib/harness');

async function run(t) {
	t.suite('SUITE 1 — Reserve happy path (verified buyer, two distinct users)');
	const seller = await h.signupVerified('seller');
	const buyer = await h.signupVerified('buyer');

	const listed = await h.createListing(seller.cookie, { title: `E2E Reserve ${Date.now()}` });
	t.is('seller can create a listing → 201', listed.status, 201);
	const ticketId = listed.data?.id;

	const order = await h.reserveReady(buyer.cookie, ticketId);
	t.is('verified buyer can reserve the ticket → 201', order.status, 201);
	const orderId = order.data?.id;
	t.is('new order starts in created status', order.data?.status, 'created');
	t.is('order is owned by the buyer', order.data?.userId, buyer.userId);
	t.is('order populates the reserved ticket', order.data?.ticket?.id, ticketId);
	t.check('order carries an expiresAt hold timestamp', !!order.data?.expiresAt);

	t.suite('SUITE 2 — Reserve guards (auth, self-purchase, double, unlisted, missing)');
	const noAuth = await h.api('/api/orders', { body: { ticketId } });
	t.is('reserve without auth → 401', noAuth.status, 401);

	const selfBuy = await h.reserve(seller.cookie, ticketId);
	t.is('seller cannot buy own ticket → 400', selfBuy.status, 400);

	// A second listing so the "already reserved" check is isolated from SUITE 1's.
	const listed2 = await h.createListing(seller.cookie, { title: `E2E Reserve2 ${Date.now()}` });
	const ticket2Id = listed2.data?.id;
	const firstHold = await h.reserveReady(buyer.cookie, ticket2Id);
	t.is('first reservation of ticket2 → 201', firstHold.status, 201);

	// Reserve the same ticket again with a third user — it is already held.
	const buyer3 = await h.signupVerified('buyer3');
	const doubleHold = await h.reserve(buyer3.cookie, ticket2Id);
	t.is('reserving an already-reserved ticket → 400', doubleHold.status, 400);

	// Unlisted ticket: seller lists then unlists it before anyone reserves.
	const listed3 = await h.createListing(seller.cookie, { title: `E2E Unlist ${Date.now()}` });
	const ticket3Id = listed3.data?.id;
	const unlist = await h.api(`/api/tickets/${ticket3Id}`, { method: 'DELETE', cookie: seller.cookie });
	t.is('seller can unlist a ticket → 200', unlist.status, 200);
	// Orders validates against its own ticket replica; let the unlist event land.
	const unlistedReserve = await h.retry(() => h.reserve(buyer.cookie, ticket3Id), {
		tries: 20,
		delay: 400,
		until: (r) => r.status === 400,
	});
	t.is('reserving an unlisted ticket → 400', unlistedReserve.status, 400);

	const missingTicket = await h.reserve(buyer.cookie, h.MISSING_ID);
	t.is('reserving a non-existent ticket → 404', missingTicket.status, 404);

	t.suite('SUITE 3 — Show order (owner vs other user vs anon)');
	const showOwner = await h.api(`/api/orders/${orderId}`, { method: 'GET', cookie: buyer.cookie });
	t.is('owner can fetch their order → 200', showOwner.status, 200);
	t.is('fetched order id matches', showOwner.data?.id, orderId);
	t.is('fetched order status is created', showOwner.data?.status, 'created');

	const showOther = await h.api(`/api/orders/${orderId}`, { method: 'GET', cookie: seller.cookie });
	t.is("another user cannot fetch someone else's order → 401", showOther.status, 401);

	const showAnon = await h.api(`/api/orders/${orderId}`, { method: 'GET' });
	t.is('fetching an order without auth → 401', showAnon.status, 401);

	const showMissing = await h.api(`/api/orders/${h.MISSING_ID}`, { method: 'GET', cookie: buyer.cookie });
	t.is('fetching a non-existent order → 404', showMissing.status, 404);

	t.suite('SUITE 4 — List my orders');
	const listNoAuth = await h.api('/api/orders', { method: 'GET' });
	t.is('listing orders without auth → 401', listNoAuth.status, 401);

	const myOrders = await h.api('/api/orders', { method: 'GET', cookie: buyer.cookie });
	t.is('buyer can list their orders → 200', myOrders.status, 200);
	t.check('orders list is an array', Array.isArray(myOrders.data));
	t.check(
		'list contains the order we created',
		Array.isArray(myOrders.data) && myOrders.data.some((o) => o.id === orderId),
	);

	t.suite('SUITE 5 — Cancel order (owner vs other user vs anon)');
	const cancelAnon = await h.api(`/api/orders/${orderId}`, { method: 'DELETE' });
	t.is('cancelling without auth → 401', cancelAnon.status, 401);

	const cancelOther = await h.api(`/api/orders/${orderId}`, { method: 'DELETE', cookie: seller.cookie });
	t.is("another user cannot cancel someone else's order → 401", cancelOther.status, 401);

	const cancelMissing = await h.api(`/api/orders/${h.MISSING_ID}`, { method: 'DELETE', cookie: buyer.cookie });
	t.is('cancelling a non-existent order → 404', cancelMissing.status, 404);

	const cancel = await h.api(`/api/orders/${orderId}`, { method: 'DELETE', cookie: buyer.cookie });
	t.is('owner can cancel their order → 204', cancel.status, 204);

	const afterCancel = await h.retry(
		() => h.api(`/api/orders/${orderId}`, { method: 'GET', cookie: buyer.cookie }),
		{ tries: 20, delay: 400, until: (r) => r.data?.status === 'cancelled' },
	);
	t.is('cancelled status is reflected on show', afterCancel.data?.status, 'cancelled');
}

module.exports = run;

if (require.main === module) {
	h.runStandalone(run, { needsMail: true });
}
