/**
 * Auth gating — "sign in to do that, then come back here".
 *
 * Two layers, end to end against the live stack:
 *   1. API contract the gating leans on: actions that need a session return 401
 *      with NO cookie (what drives the redirect), while business-rule failures
 *      (e.g. buying your own ticket) stay 400 — so they surface inline and are
 *      NOT mistaken for "please sign in".
 *   2. Client SSR behaviour: a signed-out ticket page renders a proactive
 *      "Sign in to buy" CTA carrying ?returnTo=<this ticket>; a signed-in one
 *      renders the buy control; and /tickets/new (sell) 302-redirects a
 *      signed-out visitor to sign in with ?returnTo=/tickets/new.
 *
 * Needs mail (verified buyer/seller). Part of `node e2e/run-all.js`, or
 * standalone: `node e2e/auth-gating.js`.
 */

const h = require('./lib/harness');

// Fetch an SSR page (HTML) rather than a JSON API. `redirect: 'manual'` lets us
// assert the 302 itself instead of silently following it.
async function getPage(path, { cookie, redirect = 'follow' } = {}) {
	const headers = {};
	if (cookie) headers.Cookie = cookie;
	const res = await fetch(`${h.BASE_URL}${path}`, { headers, redirect });
	const html = await res.text();
	return { status: res.status, location: res.headers.get('location'), html };
}

async function firstListedTicketId() {
	const r = await h.api('/api/tickets', { method: 'GET' });
	const list = r.data?.tickets || [];
	const listed = list.find((tk) => tk && tk.unlisted === false) || list[0];
	return listed?.id;
}

async function run(t) {
	const seller = await h.signupVerified('gate-seller');
	const buyer = await h.signupVerified('gate-buyer');
	t.check('seller signed up + verified', !!seller.cookie && seller.verified === true);
	t.check('buyer signed up + verified', !!buyer.cookie && buyer.verified === true);

	const listing = await h.createListing(seller.cookie, { title: `E2E Gate ${Date.now()}` });
	t.is('seller creates a listing → 201', listing.status, 201);
	const ticketId = listing.data?.id;
	t.check('listing has an id', !!ticketId);

	t.suite('SUITE 1 — Gated actions return 401 with no session (drives the redirect)');

	const buyNoAuth = await h.api('/api/orders', { body: { ticketId } });
	t.is('buy without a session → 401', buyNoAuth.status, 401);

	const sellNoAuth = await h.api('/api/tickets', {
		body: { title: 'No auth', price: 50, venue: 'Nowhere', eventDate: h.futureDate(10) },
	});
	t.is('sell without a session → 401', sellNoAuth.status, 401);

	t.suite('SUITE 2 — Business rules stay 400 (inline), NOT 401 (no sign-in bounce)');

	// Seller is signed in but cannot buy their own ticket. That is a 400 the user
	// should read inline — redirecting them to sign in would be nonsensical.
	const selfBuy = await h.reserveReady(seller.cookie, ticketId);
	t.is('seller buying own ticket → 400 (not 401)', selfBuy.status, 400);
	t.check('self-purchase is not treated as an auth failure', selfBuy.status !== 401);

	t.suite('SUITE 3 — Client SSR: proactive CTA, signed-in control, sell redirect');

	const anonId = await firstListedTicketId();
	t.check('found a listed ticket to view', !!anonId);

	const anonPage = await getPage(`/tickets/${anonId}`);
	t.is('signed-out ticket page renders → 200', anonPage.status, 200);
	t.check('signed-out page shows a "Sign in to buy" CTA', /Sign in to buy/.test(anonPage.html));
	t.check(
		'CTA links to sign in with a returnTo for this ticket',
		anonPage.html.includes(`returnTo=${encodeURIComponent(`/tickets/${anonId}`)}`),
	);
	t.check(
		'signed-out page does NOT show the buy/tear control',
		!/Tear here to purchase/.test(anonPage.html),
	);

	const signedInPage = await getPage(`/tickets/${anonId}`, { cookie: buyer.cookie });
	t.is('signed-in ticket page renders → 200', signedInPage.status, 200);
	t.check(
		'signed-in (non-owner) page shows the buy/tear control',
		/Tear here to purchase/.test(signedInPage.html),
	);
	t.check(
		'signed-in page does NOT show the sign-in CTA',
		!/Sign in to buy/.test(signedInPage.html),
	);

	const sellRedirect = await getPage('/tickets/new', { redirect: 'manual' });
	t.check('sell page redirects a signed-out visitor (3xx)', sellRedirect.status >= 300 && sellRedirect.status < 400);
	t.check(
		'sell redirect targets sign in with returnTo=/tickets/new',
		!!sellRedirect.location &&
			sellRedirect.location.includes('/auth/signin') &&
			sellRedirect.location.includes(`returnTo=${encodeURIComponent('/tickets/new')}`),
	);

	const sellSignedIn = await getPage('/tickets/new', { cookie: seller.cookie });
	t.is('sell page renders for a signed-in seller → 200', sellSignedIn.status, 200);
	t.check('signed-in sell page shows the ticket form', /Issue a Ticket/.test(sellSignedIn.html));
}

module.exports = run;

if (require.main === module) h.runStandalone(run, { needsMail: true });
