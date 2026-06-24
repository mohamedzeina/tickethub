/**
 * Multi-seat listings (#10) — end to end against a LIVE cluster.
 *
 * Proves the whole quantity-pool flow: a seller lists N seats, buyers reserve a
 * subset, the listing stays on sale until sold out, oversell is refused, a paid
 * multi-seat order charges price×N and mints one gate pass per seat (each
 * redeemable independently), a refund releases the seats AND revokes every pass,
 * and cancelling an unpaid hold returns its seats to the pool.
 *
 * REQUIRES (like e2e/refunds.js / e2e/admission.js): `stripe listen` running +
 * the Stripe CLI authenticated, AND the gate key in the environment:
 *   GATE_API_KEY  must equal the admission-secret's GATE_API_KEY in the cluster.
 *   export GATE_API_KEY=$(kubectl get secret admission-secret -o jsonpath='{.data.GATE_API_KEY}' | base64 -d)
 *
 * Part of the suite (`node e2e/run-all.js`) or standalone (`node e2e/multi-seat.js`).
 */

const h = require('./lib/harness');
const { execFileSync } = require('child_process');

const GATE_API_KEY = process.env.GATE_API_KEY;

function settlePaymentIntent(clientSecret) {
	const intentId = clientSecret.split('_secret_')[0];
	execFileSync(
		'stripe',
		['payment_intents', 'confirm', intentId, '-d', 'payment_method=pm_card_visa'],
		{ stdio: 'pipe' },
	);
}

// GET a single ticket; returns its current { quantity, availableQty, ... }.
const showTicket = (cookie, id) =>
	h.api(`/api/tickets/${id}`, { method: 'GET', cookie });

// Poll the ticket until availableQty settles to `want` (the master decrements it
// asynchronously on order:created via ticket:updated).
const waitForAvailable = (cookie, id, want) =>
	h.retry(() => showTicket(cookie, id), {
		tries: 40,
		delay: 500,
		until: (r) => r.status === 200 && r.data?.availableQty === want,
	});

// Is `id` visible in the marketplace? Query by the listing's unique title so we
// don't depend on pagination.
async function inMarketplace(title, id) {
	const r = await h.api(`/api/tickets?q=${encodeURIComponent(title)}&limit=50`, {
		method: 'GET',
	});
	return (r.data?.tickets || []).some((tk) => tk.id === id);
}

// Reserve a specific number of seats.
const reserveSeats = (cookie, ticketId, quantity) =>
	h.retry(
		() => h.api('/api/orders', { cookie, body: { ticketId, quantity } }),
		{ tries: 20, delay: 400, until: (r) => r.status !== 404 },
	);

// Pay + settle an order, then poll until all its seat passes are issued. Returns
// the passes array (sorted by seat, each with its own code).
async function payAndCollectPasses(buyer, orderId, expectSeats) {
	const pay = await h.payIntent(buyer.cookie, orderId);
	settlePaymentIntent(pay.data.clientSecret);
	const res = await h.retry(
		() => h.api(`/api/passes/order/${orderId}`, { method: 'GET', cookie: buyer.cookie }),
		{
			tries: 60,
			delay: 500,
			until: (r) =>
				r.status === 200 &&
				(r.data?.passes || []).length === expectSeats &&
				r.data.passes.every((p) => p.status === 'issued' && !!p.code),
		},
	);
	return res.data?.passes || [];
}

async function run(t) {
	if (!GATE_API_KEY) {
		t.check(
			'GATE_API_KEY provided in env',
			false,
			"export GATE_API_KEY=$(kubectl get secret admission-secret -o jsonpath='{.data.GATE_API_KEY}' | base64 -d)",
		);
		return;
	}

	const seller = await h.signupVerified('ms-seller');

	t.suite('SUITE 1 — A multi-seat listing reserves a subset and stays on sale');
	const titleA = `MultiSeat A ${Date.now()}`;
	const listingA = await h.createListing(seller.cookie, {
		title: titleA,
		price: 30,
		quantity: 4,
	});
	t.is('listing created → 201', listingA.status, 201);
	t.is('listing reports its seat count', listingA.data?.quantity, 4);
	t.is('all seats initially available', listingA.data?.availableQty, 4);
	const idA = listingA.data.id;

	const buyer1 = await h.signupVerified('ms-buyer1');
	const order1 = await reserveSeats(buyer1.cookie, idA, 3);
	t.is('buyer reserves 3 of 4 seats → 201', order1.status, 201);
	t.is('order records the seat count', order1.data?.quantity, 3);

	const afterReserve = await waitForAvailable(seller.cookie, idA, 1);
	t.is('listing now shows 1 seat left', afterReserve.data?.availableQty, 1);
	t.check('partially-sold listing is still in the marketplace', await inMarketplace(titleA, idA));

	t.suite('SUITE 2 — Oversell is refused; the last seat sells out the listing');
	const buyer2 = await h.signupVerified('ms-buyer2');
	const tooMany = await h.api('/api/orders', {
		cookie: buyer2.cookie,
		body: { ticketId: idA, quantity: 2 },
	});
	t.is('asking for 2 when 1 remains → 400', tooMany.status, 400);
	t.check(
		'rejection explains how many are left',
		/only\s+1\s+seat/i.test(tooMany.data?.errors?.[0]?.message || ''),
	);

	const order2 = await reserveSeats(buyer2.cookie, idA, 1);
	t.is('buyer takes the final seat → 201', order2.status, 201);
	const soldOut = await waitForAvailable(seller.cookie, idA, 0);
	t.is('listing now shows 0 seats left', soldOut.data?.availableQty, 0);
	t.check('a sold-out listing drops out of the marketplace', !(await inMarketplace(titleA, idA)));

	t.suite('SUITE 3 — Paying a multi-seat order mints one pass per seat');
	const passes1 = await payAndCollectPasses(buyer1, order1.data.id, 3);
	t.is('a 3-seat order mints 3 passes', passes1.length, 3);
	t.is('passes are numbered by seat', passes1.map((p) => p.seat).join(','), '1,2,3');
	t.is('every seat pass has a distinct code', new Set(passes1.map((p) => p.code)).size, 3);

	t.suite('SUITE 4 — Each seat pass redeems independently at the gate');
	const redeem0 = await h.api('/api/passes/redeem', {
		body: { code: passes1[0].code },
		headers: { 'x-gate-key': GATE_API_KEY },
	});
	t.check('seat 1 scans in (valid:true)', redeem0.data?.valid === true);
	const redeem1 = await h.api('/api/passes/redeem', {
		body: { code: passes1[1].code },
		headers: { 'x-gate-key': GATE_API_KEY },
	});
	t.check('seat 2 scans in independently (valid:true)', redeem1.data?.valid === true);

	const mid = await h.api(`/api/passes/order/${order1.data.id}`, {
		method: 'GET',
		cookie: buyer1.cookie,
	});
	const bySeat = Object.fromEntries((mid.data?.passes || []).map((p) => [p.seat, p]));
	t.is('seat 1 now redeemed', bySeat[1]?.status, 'redeemed');
	t.is('seat 2 now redeemed', bySeat[2]?.status, 'redeemed');
	t.is('seat 3 still issued (untouched)', bySeat[3]?.status, 'issued');

	t.suite('SUITE 5 — A refund releases the seats AND revokes every pass');
	const titleB = `MultiSeat B ${Date.now()}`;
	const listingB = await h.createListing(seller.cookie, {
		title: titleB,
		price: 25,
		quantity: 3,
	});
	const idB = listingB.data.id;
	const buyer3 = await h.signupVerified('ms-buyer3');
	const order3 = await reserveSeats(buyer3.cookie, idB, 3);
	t.is('buyer reserves all 3 seats → 201', order3.status, 201);
	const passes3 = await payAndCollectPasses(buyer3, order3.data.id, 3);
	t.is('3 unredeemed passes minted', passes3.length, 3);

	const refund = await h.api(`/api/orders/${order3.data.id}/refund`, {
		method: 'POST',
		cookie: buyer3.cookie,
	});
	t.is('buyer requests a refund → 200', refund.status, 200);

	const revoked = await h.retry(
		() => h.api(`/api/passes/order/${order3.data.id}`, { method: 'GET', cookie: buyer3.cookie }),
		{
			tries: 40,
			delay: 500,
			until: (r) =>
				r.status === 200 && (r.data?.passes || []).every((p) => p.status === 'revoked'),
		},
	);
	t.is(
		'all 3 passes are revoked',
		(revoked.data?.passes || []).filter((p) => p.status === 'revoked').length,
		3,
	);
	const releasedB = await waitForAvailable(seller.cookie, idB, 3);
	t.is('the refunded seats are released back to the listing', releasedB.data?.availableQty, 3);
	t.check('the relisted listing is back in the marketplace', await inMarketplace(titleB, idB));

	t.suite('SUITE 6 — Cancelling an unpaid hold returns its seats');
	const titleC = `MultiSeat C ${Date.now()}`;
	const listingC = await h.createListing(seller.cookie, {
		title: titleC,
		price: 18,
		quantity: 2,
	});
	const idC = listingC.data.id;
	const buyer4 = await h.signupVerified('ms-buyer4');
	const order4 = await reserveSeats(buyer4.cookie, idC, 2);
	t.is('buyer holds both seats → 201', order4.status, 201);
	await waitForAvailable(seller.cookie, idC, 0);

	const cancel = await h.api(`/api/orders/${order4.data.id}`, {
		method: 'DELETE',
		cookie: buyer4.cookie,
	});
	t.is('buyer cancels the unpaid hold → 204', cancel.status, 204);
	const releasedC = await waitForAvailable(seller.cookie, idC, 2);
	t.is('both held seats return to the listing', releasedC.data?.availableQty, 2);
	t.check('the listing is buyable again', await inMarketplace(titleC, idC));
}

module.exports = run;

if (require.main === module) {
	h.runStandalone(run, { needsMail: true });
}
