/**
 * Tickets (listings) — create / show / index+search / my-listings / edit /
 * unlist / relist, end to end against the live API. Happy AND negative paths.
 *
 * Runs on top of seed data: every actor and listing is unique-per-run and we
 * only ever assert on items WE created (filtered by id / unique title). Cross
 * -service replica lag (a reservation propagating into the tickets service) is
 * polled with h.retry — never asserted instantly.
 *
 * Part of the suite (`node e2e/run-all.js`) or standalone (`node e2e/tickets.js`).
 */

const h = require('./lib/harness');

const MISSING_ID = '0'.repeat(24); // valid ObjectId shape, no such ticket

async function run(t) {
	const stamp = Date.now();
	// A verified seller and a verified second user (buyer / non-owner) for the
	// whole suite. Both must be verified — selling/buying require it.
	const seller = await h.signupVerified('tickets-seller');
	const other = await h.signupVerified('tickets-other');
	t.check('seller signed up + verified', !!seller.cookie && seller.verified === true);
	t.check('second user signed up + verified', !!other.cookie && other.verified === true);

	t.suite('SUITE 1 — Create listing (happy + validation)');

	const uniqueTitle = `E2E Listing ${stamp}-MAIN`;
	const created = await h.createListing(seller.cookie, {
		title: uniqueTitle,
		price: 123.45,
		venue: 'The O2, London',
		category: 'Concerts',
	});
	t.is('verified seller creates a listing → 201', created.status, 201);
	const ticketId = created.data?.id;
	t.check('created listing has an id', !!ticketId);
	t.is('created title echoed back', created.data?.title, uniqueTitle);
	t.is('created price echoed back', created.data?.price, 123.45);
	t.is('created listing starts at version 0', created.data?.version, 0);
	t.is('created listing is listed (unlisted=false)', created.data?.unlisted, false);
	t.is('created listing belongs to the seller', created.data?.userId, seller.userId);
	t.check(
		'created listing is fully available (not reserved)',
		created.data?.availableQty === created.data?.quantity,
	);

	const noAuth = await h.api('/api/tickets', {
		body: { title: 'No auth', price: 50, venue: 'Nowhere', eventDate: h.futureDate(10) },
	});
	t.is('create without auth → 401', noAuth.status, 401);

	const missingTitle = await h.createListing(seller.cookie, { title: '' });
	t.is('create with empty title → 400', missingTitle.status, 400);

	const zeroPrice = await h.createListing(seller.cookie, { price: 0 });
	t.is('create with price 0 → 400', zeroPrice.status, 400);

	const negativePrice = await h.createListing(seller.cookie, { price: -10 });
	t.is('create with negative price → 400', negativePrice.status, 400);

	const pastDate = await h.createListing(seller.cookie, { eventDate: '2000-01-01T00:00:00.000Z' });
	t.is('create with past event date → 400', pastDate.status, 400);

	const badDate = await h.createListing(seller.cookie, { eventDate: 'not-a-date' });
	t.is('create with malformed event date → 400', badDate.status, 400);

	const noVenue = await h.api('/api/tickets', {
		cookie: seller.cookie,
		body: { title: `NoVenue ${stamp}`, price: 50, eventDate: h.futureDate(10) },
	});
	t.is('create with missing venue → 400', noVenue.status, 400);

	const badCategory = await h.createListing(seller.cookie, { category: 'NotACategory' });
	t.is('create with invalid category → 400', badCategory.status, 400);

	const badImage = await h.createListing(seller.cookie, { imageUrl: 'not a url' });
	t.is('create with invalid image URL → 400', badImage.status, 400);

	t.suite('SUITE 2 — Show by id');

	const show = await h.api(`/api/tickets/${ticketId}`, { method: 'GET' });
	t.is('show created listing → 200', show.status, 200);
	t.is('show returns the right id', show.data?.id, ticketId);
	t.is('show returns the right title', show.data?.title, uniqueTitle);
	t.is('show returns the venue', show.data?.venue, 'The O2, London');

	const showMissing = await h.api(`/api/tickets/${MISSING_ID}`, { method: 'GET' });
	t.is('show unknown id → 404', showMissing.status, 404);

	t.suite('SUITE 3 — Index, search, filter, sort, pagination');

	const index = await h.api('/api/tickets/', { method: 'GET' });
	t.is('index → 200', index.status, 200);
	t.check('index returns a tickets array', Array.isArray(index.data?.tickets));
	t.check('index returns pagination metadata', typeof index.data?.total === 'number');

	// Search by our unique title — should find exactly our listing.
	const search = await h.api(`/api/tickets/?q=${encodeURIComponent(uniqueTitle)}`, {
		method: 'GET',
	});
	t.is('search by unique title → 200', search.status, 200);
	t.check(
		'search by unique title returns our listing',
		(search.data?.tickets || []).some((tk) => tk.id === ticketId),
	);

	// A search term that cannot match our listing must NOT return it.
	const searchMiss = await h.api(`/api/tickets/?q=zzz-no-such-${stamp}`, { method: 'GET' });
	t.check(
		'search for an absent term excludes our listing',
		!(searchMiss.data?.tickets || []).some((tk) => tk.id === ticketId),
	);

	// Category filter: our listing is a Concert, so a Sports filter must hide it.
	const sportsOnly = await h.api(`/api/tickets/?category=Sports&q=${encodeURIComponent(uniqueTitle)}`, {
		method: 'GET',
	});
	t.check(
		'Sports filter excludes our Concerts listing',
		!(sportsOnly.data?.tickets || []).some((tk) => tk.id === ticketId),
	);
	const concertsOnly = await h.api(
		`/api/tickets/?category=Concerts&q=${encodeURIComponent(uniqueTitle)}`,
		{ method: 'GET' },
	);
	t.check(
		'Concerts filter includes our Concerts listing',
		(concertsOnly.data?.tickets || []).some((tk) => tk.id === ticketId),
	);

	// Price range: our listing is 123.45.
	const inRange = await h.api(
		`/api/tickets/?minPrice=100&maxPrice=200&q=${encodeURIComponent(uniqueTitle)}`,
		{ method: 'GET' },
	);
	t.check(
		'price range [100,200] includes our 123.45 listing',
		(inRange.data?.tickets || []).some((tk) => tk.id === ticketId),
	);
	const outOfRange = await h.api(
		`/api/tickets/?minPrice=200&maxPrice=300&q=${encodeURIComponent(uniqueTitle)}`,
		{ method: 'GET' },
	);
	t.check(
		'price range [200,300] excludes our 123.45 listing',
		!(outOfRange.data?.tickets || []).some((tk) => tk.id === ticketId),
	);

	// Sort variants — all valid, all 200.
	for (const sort of ['newest', 'price_asc', 'price_desc', 'date_asc']) {
		const sorted = await h.api(`/api/tickets/?sort=${sort}`, { method: 'GET' });
		t.is(`sort=${sort} → 200`, sorted.status, 200);
	}

	// price_asc actually orders ascending across our own three priced listings.
	const cheap = await h.createListing(seller.cookie, {
		title: `E2E Sort ${stamp}`,
		price: 11,
	});
	const dear = await h.createListing(seller.cookie, {
		title: `E2E Sort ${stamp}`,
		price: 999,
	});
	const ascending = await h.api(
		`/api/tickets/?sort=price_asc&limit=50&q=${encodeURIComponent(`E2E Sort ${stamp}`)}`,
		{ method: 'GET' },
	);
	const prices = (ascending.data?.tickets || []).map((tk) => tk.price);
	t.check(
		'price_asc returns our sort listings in ascending order',
		prices.length >= 2 && prices.every((p, i) => i === 0 || prices[i - 1] <= p),
	);

	// Pagination metadata is well-formed and honoured.
	const paged = await h.api('/api/tickets/?page=1&limit=5', { method: 'GET' });
	t.is('page=1&limit=5 → 200', paged.status, 200);
	t.is('limit is honoured in metadata', paged.data?.limit, 5);
	t.is('page is honoured in metadata', paged.data?.page, 1);
	t.check('page does not exceed limit', (paged.data?.tickets || []).length <= 5);

	// Invalid query params → 400.
	const badCat = await h.api('/api/tickets/?category=Bogus', { method: 'GET' });
	t.is('invalid category param → 400', badCat.status, 400);
	const badPage = await h.api('/api/tickets/?page=0', { method: 'GET' });
	t.is('page=0 → 400', badPage.status, 400);
	const badLimit = await h.api('/api/tickets/?limit=999', { method: 'GET' });
	t.is('limit=999 (over max) → 400', badLimit.status, 400);
	const badSort = await h.api('/api/tickets/?sort=sideways', { method: 'GET' });
	t.is('invalid sort param → 400', badSort.status, 400);

	t.suite('SUITE 4 — My listings');

	const mine = await h.api('/api/tickets/mine', { method: 'GET', cookie: seller.cookie });
	t.is('mine → 200', mine.status, 200);
	const mineList = Array.isArray(mine.data) ? mine.data : mine.data?.tickets || [];
	t.check(
		'mine includes our created listing',
		mineList.some((tk) => tk.id === ticketId),
	);
	t.check(
		'mine returns only the caller\'s listings',
		mineList.every((tk) => tk.userId === seller.userId),
	);

	const mineNoAuth = await h.api('/api/tickets/mine', { method: 'GET' });
	t.is('mine without auth → 401', mineNoAuth.status, 401);

	const otherMine = await h.api('/api/tickets/mine', { method: 'GET', cookie: other.cookie });
	const otherList = Array.isArray(otherMine.data) ? otherMine.data : otherMine.data?.tickets || [];
	t.check(
		'another user\'s mine does NOT include the seller\'s listing',
		!otherList.some((tk) => tk.id === ticketId),
	);

	t.suite('SUITE 5 — Update / edit');

	const updateNoAuth = await h.api(`/api/tickets/${ticketId}`, {
		method: 'PUT',
		body: { title: 'Hijack', price: 1, venue: 'X', eventDate: h.futureDate(10) },
	});
	t.is('update without auth → 401', updateNoAuth.status, 401);

	const updateNotOwner = await h.api(`/api/tickets/${ticketId}`, {
		method: 'PUT',
		cookie: other.cookie,
		body: { title: 'Hijack', price: 1, venue: 'X', eventDate: h.futureDate(10) },
	});
	t.is('update by non-owner → 401', updateNotOwner.status, 401);

	const updateMissing = await h.api(`/api/tickets/${MISSING_ID}`, {
		method: 'PUT',
		cookie: seller.cookie,
		body: { title: 'Ghost', price: 5, venue: 'X', eventDate: h.futureDate(10) },
	});
	t.is('update unknown id → 404', updateMissing.status, 404);

	const updateBadTitle = await h.api(`/api/tickets/${ticketId}`, {
		method: 'PUT',
		cookie: seller.cookie,
		body: { title: '', price: 5, venue: 'X', eventDate: h.futureDate(10) },
	});
	t.is('update with empty title → 400', updateBadTitle.status, 400);

	const updateBadPrice = await h.api(`/api/tickets/${ticketId}`, {
		method: 'PUT',
		cookie: seller.cookie,
		body: { title: uniqueTitle, price: -1, venue: 'X', eventDate: h.futureDate(10) },
	});
	t.is('update with negative price → 400', updateBadPrice.status, 400);

	const updatePastDate = await h.api(`/api/tickets/${ticketId}`, {
		method: 'PUT',
		cookie: seller.cookie,
		body: { title: uniqueTitle, price: 5, venue: 'X', eventDate: '2000-01-01T00:00:00.000Z' },
	});
	t.is('update with past event date → 400', updatePastDate.status, 400);

	const newTitle = `${uniqueTitle}-EDITED`;
	const updateOk = await h.api(`/api/tickets/${ticketId}`, {
		method: 'PUT',
		cookie: seller.cookie,
		body: { title: newTitle, price: 200, venue: 'Wembley Stadium', eventDate: h.futureDate(40) },
	});
	t.is('owner update → 200', updateOk.status, 200);
	t.is('update applied new title', updateOk.data?.title, newTitle);
	t.is('update applied new price', updateOk.data?.price, 200);
	t.check('update bumped the version', (updateOk.data?.version ?? 0) > 0);

	t.suite('SUITE 6 — Unlist / relist + visibility');

	const unlistNoAuth = await h.api(`/api/tickets/${ticketId}`, { method: 'DELETE' });
	t.is('unlist without auth → 401', unlistNoAuth.status, 401);

	const unlistNotOwner = await h.api(`/api/tickets/${ticketId}`, {
		method: 'DELETE',
		cookie: other.cookie,
	});
	t.is('unlist by non-owner → 401', unlistNotOwner.status, 401);

	const unlistMissing = await h.api(`/api/tickets/${MISSING_ID}`, {
		method: 'DELETE',
		cookie: seller.cookie,
	});
	t.is('unlist unknown id → 404', unlistMissing.status, 404);

	const unlist = await h.api(`/api/tickets/${ticketId}`, { method: 'DELETE', cookie: seller.cookie });
	t.is('owner unlist → 200', unlist.status, 200);
	t.is('unlisted flag is now true', unlist.data?.unlisted, true);

	// Unlisted is hidden from non-owners (404) but visible to the owner (200).
	const showByOther = await h.api(`/api/tickets/${ticketId}`, {
		method: 'GET',
		cookie: other.cookie,
	});
	t.is('unlisted ticket hidden from non-owner → 404', showByOther.status, 404);

	const showByOwner = await h.api(`/api/tickets/${ticketId}`, {
		method: 'GET',
		cookie: seller.cookie,
	});
	t.is('unlisted ticket visible to owner → 200', showByOwner.status, 200);
	t.is('owner sees unlisted=true', showByOwner.data?.unlisted, true);

	// And it disappears from the public index search.
	const indexAfterUnlist = await h.api(`/api/tickets/?q=${encodeURIComponent(newTitle)}`, {
		method: 'GET',
	});
	t.check(
		'unlisted listing is excluded from the public index',
		!(indexAfterUnlist.data?.tickets || []).some((tk) => tk.id === ticketId),
	);

	const relistNotOwner = await h.api(`/api/tickets/${ticketId}/relist`, {
		method: 'POST',
		cookie: other.cookie,
	});
	t.is('relist by non-owner → 401', relistNotOwner.status, 401);

	const relistMissing = await h.api(`/api/tickets/${MISSING_ID}/relist`, {
		method: 'POST',
		cookie: seller.cookie,
	});
	t.is('relist unknown id → 404', relistMissing.status, 404);

	const relist = await h.api(`/api/tickets/${ticketId}/relist`, {
		method: 'POST',
		cookie: seller.cookie,
	});
	t.is('owner relist → 200', relist.status, 200);
	t.is('relisted flag is now false', relist.data?.unlisted, false);

	const showAfterRelist = await h.api(`/api/tickets/${ticketId}`, { method: 'GET' });
	t.is('relisted ticket is publicly visible again → 200', showAfterRelist.status, 200);

	t.suite('SUITE 7 — Reserved tickets are frozen for edits');

	// Stand up a fresh listing, reserve it with the other user, then confirm the
	// reservation propagated into the tickets service before asserting on edits.
	const freshTitle = `E2E Reserve ${stamp}`;
	const fresh = await h.createListing(seller.cookie, { title: freshTitle, price: 75 });
	const freshId = fresh.data?.id;
	t.is('fresh reservable listing created → 201', fresh.status, 201);

	const order = await h.reserveReady(other.cookie, freshId);
	t.is('buyer reserves the fresh listing → 201', order.status, 201);

	// Reservation flows back via OrderCreated → tickets drops availableQty below
	// quantity (#10). Poll until the tickets service reflects it (replica/event
	// lag), then assert edits fail.
	const reserved = await h.retry(
		() => h.api(`/api/tickets/${freshId}`, { method: 'GET', cookie: seller.cookie }),
		{ tries: 25, delay: 500, until: (r) => r.data?.availableQty < r.data?.quantity },
	);
	t.check(
		'reservation propagated into tickets service',
		reserved.data?.availableQty < reserved.data?.quantity,
	);

	const editReserved = await h.api(`/api/tickets/${freshId}`, {
		method: 'PUT',
		cookie: seller.cookie,
		body: { title: `${freshTitle}-edit`, price: 80, venue: 'X', eventDate: h.futureDate(10) },
	});
	t.is('editing a reserved ticket → 400', editReserved.status, 400);

	const unlistReserved = await h.api(`/api/tickets/${freshId}`, {
		method: 'DELETE',
		cookie: seller.cookie,
	});
	t.is('unlisting a reserved ticket → 400', unlistReserved.status, 400);

	// NOTE: webhook settlement needs a real Stripe signature and is out of scope
	// here — this suite asserts ticket state only up to reservation.
}

module.exports = run;

if (require.main === module) {
	h.runStandalone(run, { needsMail: true });
}
