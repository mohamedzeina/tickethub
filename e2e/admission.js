/**
 * Admission (#delivery) — the ticket a buyer actually uses, end to end. Settles a
 * real Stripe test payment so a pass is minted, then exercises the full pass
 * lifecycle: fetch → owner-only gating → gate-key gating → redeem-once → and a
 * refund revoking an unused pass.
 *
 * REQUIRES (like e2e/refunds.js): `stripe listen` running + the Stripe CLI
 * authenticated, AND the gate key in the environment:
 *   GATE_API_KEY  must equal the admission-secret's GATE_API_KEY in the cluster.
 *   Get it with:  kubectl get secret admission-secret -o jsonpath='{.data.GATE_API_KEY}' | base64 -d
 *
 * Part of the suite (`node e2e/run-all.js`) or standalone (`node e2e/admission.js`).
 */

const h = require('./lib/harness');

const GATE_API_KEY = process.env.GATE_API_KEY;

// Sign up buyer+seller, list, reserve, pay, settle, and wait for the pass to be
// minted. Returns the buyer/order + the issued pass response (with its code).
async function paidOrderWithPass(prefix) {
	const seller = await h.signupVerified(`${prefix}-seller`);
	const buyer = await h.signupVerified(`${prefix}-buyer`);
	const listing = await h.createListing(seller.cookie, {
		title: `Gate Seat ${Date.now()}`,
		price: 40,
		venue: 'The O2, London',
	});
	const order = await h.reserveReady(buyer.cookie, listing.data?.id);
	const pay = await h.payIntent(buyer.cookie, order.data?.id);
	h.settlePaymentIntent(pay.data.clientSecret);

	// Pass is minted off payment:created (after the webhook) — poll until issued.
	// A single-seat order yields exactly one pass (returned in the passes array).
	const passRes = await h.retry(
		() => h.api(`/api/passes/order/${order.data.id}`, { method: 'GET', cookie: buyer.cookie }),
		{
			tries: 60,
			delay: 500,
			until: (r) =>
				r.status === 200 &&
				r.data?.passes?.[0]?.status === 'issued' &&
				!!r.data?.passes?.[0]?.code,
		},
	);
	return { buyer, order, passRes, pass: passRes.data?.passes?.[0] };
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

	t.suite('SUITE 1 — A pass is minted on payment and shown to the buyer');
	const { buyer, order, passRes, pass } = await paidOrderWithPass('adm');
	t.is('buyer fetches their pass → 200', passRes.status, 200);
	t.is('a single-seat order yields one pass', passRes.data?.passes?.length, 1);
	t.is('pass starts issued', pass?.status, 'issued');
	t.check(
		'pass carries a signed gate code',
		typeof pass?.code === 'string' && pass.code.includes('.'),
	);
	const code = pass.code;

	t.suite('SUITE 2 — A pass is private to its owner');
	const stranger = await h.signupVerified('adm-stranger');
	const notMine = await h.api(`/api/passes/order/${order.data.id}`, {
		method: 'GET',
		cookie: stranger.cookie,
	});
	t.is("a stranger can't read someone else's pass → 401", notMine.status, 401);

	t.suite('SUITE 3 — The gate scan requires the gate key');
	const noKey = await h.api('/api/passes/redeem', { body: { code } });
	t.is('redeem with no gate key → 401', noKey.status, 401);
	const badKey = await h.api('/api/passes/redeem', {
		body: { code },
		headers: { 'x-gate-key': 'wrong-key' },
	});
	t.is('redeem with a wrong gate key → 401', badKey.status, 401);

	t.suite('SUITE 4 — Redeem admits exactly once');
	const redeem = await h.api('/api/passes/redeem', {
		body: { code },
		headers: { 'x-gate-key': GATE_API_KEY },
	});
	t.is('first scan → 200', redeem.status, 200);
	t.check('first scan admits (valid:true)', redeem.data?.valid === true);
	t.is('first scan echoes the event', redeem.data?.eventTitle?.startsWith('Gate Seat'), true);

	const again = await h.api('/api/passes/redeem', {
		body: { code },
		headers: { 'x-gate-key': GATE_API_KEY },
	});
	t.check('second scan is refused (valid:false)', again.data?.valid === false);
	t.is('second scan reason is "redeemed"', again.data?.reason, 'redeemed');

	const after = await h.api(`/api/passes/order/${order.data.id}`, {
		method: 'GET',
		cookie: buyer.cookie,
	});
	t.is('buyer now sees the pass as redeemed', after.data?.passes?.[0]?.status, 'redeemed');
	t.check('a redeemed pass no longer exposes a code', !after.data?.passes?.[0]?.code);

	// The scan fires ticket:redeemed → notifications writes the buyer a
	// "Pass scanned" confirmation (#5).
	const { note: scanNote } = await h.waitForNotification(
		buyer.cookie,
		(n) => n.orderId === order.data.id && n.type === 'pass_scanned',
		{ tries: 40, delay: 500 },
	);
	t.check('buyer is notified their pass was scanned', !!scanNote);
	t.is('scan notification names the gate-scan', scanNote?.title, 'Pass scanned');
	t.check(
		'scan notification names the event',
		(scanNote?.body || '').startsWith('Your pass for "Gate Seat'),
	);

	t.suite('SUITE 5 — A refund revokes an unused pass');
	const second = await paidOrderWithPass('admrev');
	const revokedCode = second.pass.code; // capture while still issued

	const refund = await h.api(`/api/orders/${second.order.data.id}/refund`, {
		method: 'POST',
		cookie: second.buyer.cookie,
	});
	t.is('buyer requests a refund on the paid order → 200', refund.status, 200);

	const revoked = await h.retry(
		() =>
			h.api(`/api/passes/order/${second.order.data.id}`, {
				method: 'GET',
				cookie: second.buyer.cookie,
			}),
		{
			tries: 40,
			delay: 500,
			until: (r) => r.status === 200 && r.data?.passes?.[0]?.status === 'revoked',
		},
	);
	t.is('the refunded order pass is revoked', revoked.data?.passes?.[0]?.status, 'revoked');

	const tryRevoked = await h.api('/api/passes/redeem', {
		body: { code: revokedCode },
		headers: { 'x-gate-key': GATE_API_KEY },
	});
	t.check('a revoked pass is refused at the gate', tryRevoked.data?.valid === false);
	t.is('revoked scan reason is "revoked"', tryRevoked.data?.reason, 'revoked');
}

module.exports = run;

if (require.main === module) {
	h.runStandalone(run, { needsMail: true });
}
