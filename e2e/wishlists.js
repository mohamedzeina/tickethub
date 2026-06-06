/**
 * #16 Wishlists & price-drop alerts — end to end.
 *
 * A buyer saves a listing; the seller lowers the price; the wishlists service
 * detects the drop (new < last-known) and emits one alert per watcher, which
 * notifications turns into an in-app feed item + an email. No Stripe needed —
 * this is the ticket:updated → wishlists → notifications path.
 *
 * Asserts: save/list/ids round-trip, a price-drop in-app notification (typed
 * price_drop, linked to the ticket) lands for the watcher, the price-drop email
 * arrives in Mailpit, and remove takes it back off the wishlist.
 *
 * Part of the suite (`node e2e/run-all.js`) or standalone (`node e2e/wishlists.js`).
 */

const h = require('./lib/harness');

const notifList = (r) => (r.data && r.data.notifications) || [];

async function run(t) {
	t.suite('SUITE 1 — save a listing and get alerted on a price drop');

	const seller = await h.signupVerified('wl-seller');
	const buyer = await h.signupVerified('wl-buyer');

	const listing = await h.createListing(seller.cookie, {
		title: `Wishlist Seat ${Date.now()}`,
		price: 100,
	});
	t.is('seller creates a listing → 201', listing.status, 201);
	const ticketId = listing.data?.id;
	if (!ticketId) return;

	const save = await h.api('/api/wishlists', {
		cookie: buyer.cookie,
		body: { ticketId },
	});
	t.is('buyer saves the listing → 201', save.status, 201);
	t.is('save reports saved=true', save.data?.saved, true);

	const ids = await h.api('/api/wishlists/ids', { method: 'GET', cookie: buyer.cookie });
	t.check('wishlist ids include the saved ticket', (ids.data?.ids || []).includes(ticketId),
		`ids were ${JSON.stringify(ids.data?.ids)}`);

	// The list joins the ticket replica — retry while ticket:created propagates.
	const list = await h.retry(
		() => h.api('/api/wishlists', { method: 'GET', cookie: buyer.cookie }),
		{
			tries: 20,
			delay: 400,
			until: (r) =>
				r.status === 200 && (r.data || []).some((s) => s.ticketId === ticketId && s.ticket),
		},
	);
	const entry = (list.data || []).find((s) => s.ticketId === ticketId);
	t.check('saved item carries current ticket details', !!entry?.ticket?.title,
		'no ticket details joined');

	// The thing under test: the seller lowers the price.
	const update = await h.api(`/api/tickets/${ticketId}`, {
		method: 'PUT',
		cookie: seller.cookie,
		body: {
			title: listing.data.title,
			price: 60,
			eventDate: listing.data.eventDate,
			venue: listing.data.venue,
		},
	});
	t.is('seller lowers the price → 200', update.status, 200);

	// Buyer gets an in-app price-drop notification, linked to the listing.
	const note = await h.retry(
		() => h.api('/api/notifications', { method: 'GET', cookie: buyer.cookie }),
		{
			tries: 30,
			delay: 500,
			until: (r) =>
				r.status === 200 &&
				notifList(r).some((n) => n.type === 'price_drop' && n.ticketId === ticketId),
		},
	);
	t.check('buyer receives a price-drop notification linked to the ticket',
		notifList(note).some((n) => n.type === 'price_drop' && n.ticketId === ticketId),
		'no matching price_drop notification');

	// And the price-drop email lands in Mailpit.
	const emails = await h.retry(() => h.countMail(buyer.email, 'Price drop'), {
		tries: 20,
		delay: 500,
		until: (n) => n >= 1,
	});
	t.check('buyer receives a price-drop email', emails >= 1);

	t.suite('SUITE 2 — remove from wishlist');

	const del = await h.api(`/api/wishlists/${ticketId}`, { method: 'DELETE', cookie: buyer.cookie });
	t.is('buyer removes the listing → 200', del.status, 200);

	const idsAfter = await h.api('/api/wishlists/ids', { method: 'GET', cookie: buyer.cookie });
	t.check('wishlist no longer includes the ticket',
		!(idsAfter.data?.ids || []).includes(ticketId),
		'ticket still present after removal');

	t.suite('SUITE 3 — wishlist requires auth');
	const unauth = await h.api('/api/wishlists/ids', { method: 'GET' });
	t.is('unauthenticated wishlist read → 401', unauth.status, 401);
}

module.exports = run;

if (require.main === module) {
	h.runStandalone(run, { needsMail: true });
}
