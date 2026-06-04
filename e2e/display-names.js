/**
 * #18 user display names — the public, user-editable name that replaces the
 * opaque "Seller A1B2" handle on listings and seller profiles.
 *
 * The name lives in auth and is resolved on demand (display-only + mutable, so
 * it's deliberately NOT propagated as an event/replica and NOT carried in the
 * JWT). This suite drives the auth surface end to end through the ingress:
 *   • PATCH /api/users/me sets / clears the name (auth + validation gated)
 *   • GET /api/users/:id and GET /api/users?ids= return only display fields
 *   • the name never leaks the email and never enters the JWT (currentuser)
 *
 * Part of the suite (`node e2e/run-all.js`) or standalone (`node e2e/display-names.js`).
 */

const h = require('./lib/harness');

async function run(t) {
	t.suite('SUITE 1 — a user sets their display name');
	const alice = await h.signupVerified('dn-alice');
	const bob = await h.signupVerified('dn-bob');

	// Fresh accounts have no name yet.
	const before = await h.api(`/api/users/${alice.userId}`, { method: 'GET' });
	t.is('public read of a new user → 200', before.status, 200);
	t.is('a new user has no display name', before.data?.displayName, null);

	const patch = await h.api('/api/users/me', {
		method: 'PATCH',
		cookie: alice.cookie,
		body: { displayName: '  Avery   Stone  ' },
	});
	t.is('PATCH /api/users/me → 200', patch.status, 200);
	t.is('the name is trimmed + whitespace-collapsed', patch.data?.displayName, 'Avery Stone');
	// PATCH /me returns the OWNER their own account (incl. their email, like
	// signin/signup) — that's fine. What must never appear is credential material.
	t.check('PATCH response never leaks password/token material',
		!/password|Token|passwordReset/.test(JSON.stringify(patch.data)),
		'response contained credential material');

	t.suite('SUITE 2 — the name is publicly resolvable, display-only');
	const single = await h.api(`/api/users/${alice.userId}`, { method: 'GET' });
	t.is('public single read → 200', single.status, 200);
	t.is('it returns the set display name', single.data?.displayName, 'Avery Stone');
	t.is('it returns only id + displayName', Object.keys(single.data || {}).sort().join(','),
		'displayName,id');
	t.check('the public read never exposes the email',
		!JSON.stringify(single.data).includes('@'), 'public response contained an @');

	await h.api('/api/users/me', {
		method: 'PATCH',
		cookie: bob.cookie,
		body: { displayName: 'Jordan Reyes' },
	});

	const batch = await h.api(
		`/api/users?ids=${alice.userId},junkid,${bob.userId}`,
		{ method: 'GET' },
	);
	t.is('batch read → 200', batch.status, 200);
	const names = Object.fromEntries((batch.data || []).map((u) => [u.id, u.displayName]));
	t.is('batch resolves the first user', names[alice.userId], 'Avery Stone');
	t.is('batch resolves the second user', names[bob.userId], 'Jordan Reyes');
	t.is('batch silently drops the junk id', (batch.data || []).length, 2);

	t.suite('SUITE 3 — the name stays out of the JWT (currentuser)');
	const cu = await h.api('/api/users/currentuser', { method: 'GET', cookie: alice.cookie });
	t.is('currentuser → 200', cu.status, 200);
	t.is('currentuser identifies the right user', cu.data?.currentUser?.id, alice.userId);
	t.check('currentuser does NOT carry the display name (not in JWT)',
		cu.data?.currentUser?.displayName === undefined,
		`got ${cu.data?.currentUser?.displayName}`);

	t.suite('SUITE 4 — editing is gated and validated');
	const unauth = await h.api('/api/users/me', {
		method: 'PATCH',
		body: { displayName: 'Nope' },
	});
	t.is('unauthenticated PATCH → 401', unauth.status, 401);

	const tooLong = await h.api('/api/users/me', {
		method: 'PATCH',
		cookie: alice.cookie,
		body: { displayName: 'x'.repeat(41) },
	});
	t.is('a name longer than 40 chars → 400', tooLong.status, 400);

	// Clearing the name falls back to the handle on the client.
	const cleared = await h.api('/api/users/me', {
		method: 'PATCH',
		cookie: alice.cookie,
		body: { displayName: '   ' },
	});
	t.is('clearing the name → 200', cleared.status, 200);
	const afterClear = await h.api(`/api/users/${alice.userId}`, { method: 'GET' });
	t.is('a cleared name reads back as null', afterClear.data?.displayName, null);

	t.suite('SUITE 5 — reads degrade rather than fail');
	const unknown = await h.api(`/api/users/${'0'.repeat(24)}`, { method: 'GET' });
	t.is('an unknown user id → 404', unknown.status, 404);
	const malformed = await h.api('/api/users/not-a-real-id', { method: 'GET' });
	t.is('a malformed user id → 404', malformed.status, 404);
	const emptyBatch = await h.api('/api/users?ids=', { method: 'GET' });
	t.is('an empty batch → 200', emptyBatch.status, 200);
	t.is('an empty batch returns []', JSON.stringify(emptyBatch.data), '[]');
}

module.exports = run;

if (require.main === module) {
	h.runStandalone(run, { needsMail: true });
}
