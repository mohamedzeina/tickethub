/**
 * Auth session basics — signup, signin, currentuser, signout.
 * Happy + negative paths for the core auth surface. Email-verification and
 * password-reset are covered by e2e/account-hardening.js and are NOT repeated
 * here, so this suite needs no Mailpit access.
 *
 * Part of the suite (`node e2e/run-all.js`) or standalone (`node e2e/auth-core.js`).
 */

const h = require('./lib/harness');

async function run(t) {
	const email = h.uniqueEmail('authcore');
	const password = h.testPassword();
	const overMax = 'q'.repeat(21); // 21 chars → over the 20 max
	const underMin = 'ab'; // 2 chars → under the 4 min

	t.suite('SUITE 1 — Signup happy path');
	const signup = await h.api('/api/users/signup', { body: { email, password } });
	t.is('signup returns 201', signup.status, 201);
	t.check('signup sets a session cookie', !!signup.cookie);
	t.is('signup echoes the user email', signup.data?.email, email);
	t.check('signup returns a user id', !!signup.data?.id);
	t.is('new account starts unverified', signup.data?.emailVerified, false);
	const signupCookie = signup.cookie;

	t.suite('SUITE 2 — Signup validation & duplicates');
	const badEmail = await h.api('/api/users/signup', {
		body: { email: 'not-email', password },
	});
	t.is('invalid email format → 400', badEmail.status, 400);

	const tooShort = await h.api('/api/users/signup', {
		body: { email: h.uniqueEmail('authcore'), password: underMin },
	});
	t.is('password under 4 chars → 400', tooShort.status, 400);

	const tooLong = await h.api('/api/users/signup', {
		body: { email: h.uniqueEmail('authcore'), password: overMax },
	});
	t.is('password over 20 chars → 400', tooLong.status, 400);

	const noEmail = await h.api('/api/users/signup', { body: { password } });
	t.is('missing email field → 400', noEmail.status, 400);

	const noPassword = await h.api('/api/users/signup', {
		body: { email: h.uniqueEmail('authcore') },
	});
	t.is('missing password field → 400', noPassword.status, 400);

	const duplicate = await h.api('/api/users/signup', { body: { email, password } });
	t.is('duplicate email → 400', duplicate.status, 400);

	t.suite('SUITE 3 — Signin happy path');
	const signin = await h.api('/api/users/signin', { body: { email, password } });
	t.is('valid credentials → 200', signin.status, 200);
	t.check('signin sets a session cookie', !!signin.cookie);
	t.is('signin echoes the user email', signin.data?.email, email);
	const signedInCookie = signin.cookie || signupCookie;

	t.suite('SUITE 4 — Signin negative paths');
	const wrongPassword = await h.api('/api/users/signin', {
		body: { email, password: h.testPassword() },
	});
	t.is('wrong password → 400', wrongPassword.status, 400);

	const unknownEmail = await h.api('/api/users/signin', {
		body: { email: h.uniqueEmail('ghost'), password },
	});
	t.is('unknown email → 400', unknownEmail.status, 400);

	const signinBadEmail = await h.api('/api/users/signin', {
		body: { email: 'not-email', password },
	});
	t.is('invalid email format → 400', signinBadEmail.status, 400);

	const signinNoEmail = await h.api('/api/users/signin', { body: { password } });
	t.is('missing email field → 400', signinNoEmail.status, 400);

	const signinNoPassword = await h.api('/api/users/signin', { body: { email } });
	t.is('missing password field → 400', signinNoPassword.status, 400);

	t.suite('SUITE 5 — currentuser reflects session state');
	const whoSignedIn = await h.api('/api/users/currentuser', {
		method: 'GET',
		cookie: signedInCookie,
	});
	t.is('currentuser (signed in) → 200', whoSignedIn.status, 200);
	t.is('currentuser returns the signed-in email', whoSignedIn.data?.currentUser?.email, email);

	const whoSignedOut = await h.api('/api/users/currentuser', { method: 'GET' });
	t.is('currentuser (no cookie) → 200', whoSignedOut.status, 200);
	t.is('currentuser (no cookie) → currentUser null', whoSignedOut.data?.currentUser, null);

	t.suite('SUITE 6 — Signout clears the session');
	const signout = await h.api('/api/users/signout', { cookie: signedInCookie });
	t.is('signout → 200', signout.status, 200);
	// signout clears the cookie (sends an empty session=); the harness parses
	// that as no cookie. Send exactly that — falling back to the old cookie would
	// wrongly re-authenticate, since the JWT cookie isn't server-invalidated.
	const clearedCookie = signout.cookie;

	const whoAfterSignout = await h.api('/api/users/currentuser', {
		method: 'GET',
		cookie: clearedCookie,
	});
	t.is('currentuser after signout → currentUser null', whoAfterSignout.data?.currentUser, null);
}

module.exports = run;

if (require.main === module) {
	h.runStandalone(run, { needsMail: false });
}
