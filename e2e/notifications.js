/**
 * #6 in-app notifications — the event-driven notification feed, end to end.
 * A verified buyer reserves a verified seller's ticket; the order:created event
 * seeds an OrderCreated notification in the buyer's feed (poll with h.retry).
 * Covers: auth gates (401), feed shape + unread count, mark-one-read,
 * mark-all-read, and per-user scoping (buyer ≠ seller feed).
 *
 * Settlement (payment:created) needs a real Stripe signature and is out of
 * scope here — we assert only up to PaymentIntent creation.
 *
 * Part of the suite (`node e2e/run-all.js`) or standalone (`node e2e/notifications.js`).
 */

const h = require('./lib/harness');

async function run(t) {
	t.suite('SUITE 1 — Feed requires authentication (negative paths)');
	const noAuthList = await h.api('/api/notifications', { method: 'GET' });
	t.is('GET feed with no cookie → 401', noAuthList.status, 401);

	const noAuthReadOne = await h.api(`/api/notifications/${h.MISSING_ID}/read`, {
		method: 'POST',
	});
	t.is('mark-one-read with no cookie → 401', noAuthReadOne.status, 401);

	const noAuthReadAll = await h.api('/api/notifications/read-all', { method: 'POST' });
	t.is('mark-all-read with no cookie → 401', noAuthReadAll.status, 401);

	t.suite('SUITE 2 — Order creates a notification in the buyer feed');
	const seller = await h.signupVerified('notif-seller');
	const buyer = await h.signupVerified('notif-buyer');

	const title = `Notif Seat ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const listing = await h.createListing(seller.cookie, { title });
	t.is('verified seller creates a listing → 201', listing.status, 201);
	const ticketId = listing.data?.id;

	const order = await h.reserveReady(buyer.cookie, ticketId);
	t.is('verified buyer reserves the ticket → 201', order.status, 201);
	const orderId = order.data?.id;

	// The notification is created off the order:created NATS event, so poll the
	// feed until the OrderCreated notification for THIS order lands.
	const feed = await h.retry(
		() => h.api('/api/notifications', { method: 'GET', cookie: buyer.cookie }),
		{
			tries: 25,
			delay: 500,
			until: (r) =>
				r.status === 200 &&
				Array.isArray(r.data?.notifications) &&
				r.data.notifications.some((n) => n.orderId === orderId),
		},
	);
	t.is('GET feed (authenticated) → 200', feed.status, 200);
	t.check('feed payload has a notifications array', Array.isArray(feed.data?.notifications));
	t.check('feed payload has a numeric unreadCount', typeof feed.data?.unreadCount === 'number');

	const mine = feed.data.notifications.find((n) => n.orderId === orderId);
	t.check('a notification for my order appeared in my feed', !!mine);
	t.is('notification is scoped to me (userId)', mine?.userId, buyer.userId);
	t.is('notification type relates to the order', mine?.type, 'order_created');
	t.check('notification has a title', typeof mine?.title === 'string' && mine.title.length > 0);
	t.is('the new notification starts unread', mine?.read, false);

	t.suite('SUITE 3 — Unread count reflects my unread notifications');
	const unreadForMine = feed.data.notifications.filter((n) => !n.read).length;
	t.is(
		'unreadCount equals the count of my unread notifications',
		feed.data.unreadCount,
		unreadForMine,
	);
	t.check('unreadCount is at least 1 (my order notification)', feed.data.unreadCount >= 1);

	t.suite('SUITE 4 — Mark a single notification read');
	const readOne = await h.api(`/api/notifications/${mine.id}/read`, {
		method: 'POST',
		cookie: buyer.cookie,
	});
	t.is('mark-one-read → 200', readOne.status, 200);
	t.is('returned notification is now read', readOne.data?.read, true);
	t.is('returned notification is the same id', readOne.data?.id, mine.id);

	const afterReadOne = await h.api('/api/notifications', {
		method: 'GET',
		cookie: buyer.cookie,
	});
	const mineAfter = afterReadOne.data?.notifications?.find((n) => n.id === mine.id);
	t.is('feed now shows that notification as read', mineAfter?.read, true);
	t.is(
		'unreadCount dropped by one after marking it read',
		afterReadOne.data?.unreadCount,
		feed.data.unreadCount - 1,
	);

	t.suite('SUITE 5 — Mark-one-read edge cases');
	const readMissing = await h.api(`/api/notifications/${h.MISSING_ID}/read`, {
		method: 'POST',
		cookie: buyer.cookie,
	});
	t.is('mark-read on a non-existent notification → 404', readMissing.status, 404);

	// The seller does not own the buyer's notification → 401.
	const readNotOwner = await h.api(`/api/notifications/${mine.id}/read`, {
		method: 'POST',
		cookie: seller.cookie,
	});
	t.is("mark-read on someone else's notification → 401", readNotOwner.status, 401);

	t.suite('SUITE 6 — Mark all read clears the unread count');
	const readAll = await h.api('/api/notifications/read-all', {
		method: 'POST',
		cookie: buyer.cookie,
	});
	t.is('mark-all-read → 200', readAll.status, 200);

	const clearedFeed = await h.retry(
		() => h.api('/api/notifications', { method: 'GET', cookie: buyer.cookie }),
		{ tries: 10, delay: 400, until: (r) => r.status === 200 && r.data?.unreadCount === 0 },
	);
	t.is('unreadCount is 0 after mark-all-read', clearedFeed.data?.unreadCount, 0);
	t.check(
		'every one of my notifications is now read',
		(clearedFeed.data?.notifications || []).every((n) => n.read === true),
	);

	// read-all again on an already-clear feed is a no-op that still returns 200.
	const readAllAgain = await h.api('/api/notifications/read-all', {
		method: 'POST',
		cookie: buyer.cookie,
	});
	t.is('mark-all-read with nothing unread is a no-op → 200', readAllAgain.status, 200);

	t.suite('SUITE 7 — Notifications are private to their owner');
	const sellerFeed = await h.api('/api/notifications', {
		method: 'GET',
		cookie: seller.cookie,
	});
	t.is('seller can read their own feed → 200', sellerFeed.status, 200);
	t.check(
		"seller does NOT see the buyer's order notification",
		!(sellerFeed.data?.notifications || []).some((n) => n.orderId === orderId),
	);
	t.check(
		'every notification the seller sees is scoped to the seller',
		(sellerFeed.data?.notifications || []).every((n) => n.userId === seller.userId),
	);

	// Settlement (payment:created → PaymentSucceeded notification) needs a real
	// Stripe webhook signature and cannot be driven from here. We only confirm
	// the PaymentIntent is created; the receipt notification is out of scope.
	const pay = await h.payIntent(buyer.cookie, orderId);
	t.is('buyer can create a PaymentIntent for the order → 201', pay.status, 201);
	t.check('PaymentIntent returns a client secret', !!pay.data?.clientSecret);
}

module.exports = run;

if (require.main === module) {
	h.runStandalone(run, { needsMail: true });
}
