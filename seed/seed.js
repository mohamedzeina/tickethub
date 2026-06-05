/*
 * TicketHub seed script.
 *
 * Every run:
 *   1. Drops ALL service databases (auth, tickets, orders, payments,
 *      notifications, reviews).
 *   2. Creates two users — test@test.com and test2@test.com (password 123456).
 *   3. Creates a spread of nice demo tickets, owned by both users.
 *   4. Inserts a few seller reviews so the reputation UI (#9) has data.
 *
 * Tickets are created through the HTTP API (not inserted directly) so the
 * ticket:created events fire and the orders service replica stays in sync —
 * which is what makes the "can't buy your own ticket" rule work end to end.
 *
 * Reviews, by contrast, ARE inserted straight into the reviews db: a real
 * review needs a *completed* order, and completing one requires settling a
 * Stripe payment (webhook) the seed can't drive. The display only reads the
 * Review collection, so direct demo rows are enough to show ratings/profiles.
 *
 * Usage:
 *   cd seed && npm install && npm run seed
 *
 * Config (env vars, all optional):
 *   BASE_URL          API base. Default: https://tickethub.com
 *   HOST_HEADER       Override the Host header (use when BASE_URL is an IP).
 *   AUTH_MONGO_URI    \
 *   TICKETS_MONGO_URI  } Mongo connection strings. If unset, they are read
 *   ORDERS_MONGO_URI   } from the `mongo-secret` Kubernetes secret via kubectl.
 *   PAYMENTS_MONGO_URI/
 */

const { MongoClient, ObjectId } = require('mongodb');
const { execFileSync } = require('child_process');

const BASE_URL = (process.env.BASE_URL || 'https://tickethub.com').replace(/\/$/, '');
const HOST_HEADER = process.env.HOST_HEADER;

// The local dev ingress (tickethub.com) serves a self-signed cert. Relax TLS
// verification only for that known dev host; any other target keeps verification
// on. For a different self-signed host, run with NODE_TLS_REJECT_UNAUTHORIZED=0.
const targetHost = (() => {
	try {
		return new URL(BASE_URL).hostname;
	} catch {
		return '';
	}
})();
if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED && targetHost === 'tickethub.com') {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// service -> key inside the mongo-secret Kubernetes secret.
// Note: the notifications AND reviews dbs MUST be reset alongside the others.
// Their idempotency guard keys on (channel, sequence); a fresh NATS stream after
// a `skaffold` restart reuses low sequence numbers, so stale ProcessedEvent rows
// would make this run's ticket/order/payment events look already-handled and get
// silently skipped (no replica, no notification, no review eligibility).
const MONGO_SECRET_KEYS = {
	auth: 'AUTH_MONGO_URI',
	tickets: 'TICKETS_MONGO_URI',
	orders: 'ORDERS_MONGO_URI',
	payments: 'PAYMENTS_MONGO_URI',
	notifications: 'NOTIFICATIONS_MONGO_URI',
	reviews: 'REVIEWS_MONGO_URI',
	admission: 'ADMISSION_MONGO_URI',
};

// ---- helpers -------------------------------------------------------------

// Returns a YYYY-MM-DD string `days` in the future, so seeded events always
// pass the "event date can't be in the past" validation regardless of when run.
function future(days) {
	const d = new Date();
	d.setDate(d.getDate() + days);
	return d.toISOString().slice(0, 10);
}

function img(id) {
	return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=80`;
}

function resolveMongoUris() {
	// 1) explicit env vars take precedence
	const fromEnv = {};
	let haveAll = true;
	for (const [svc, key] of Object.entries(MONGO_SECRET_KEYS)) {
		if (process.env[key]) fromEnv[svc] = process.env[key];
		else haveAll = false;
	}
	if (haveAll) return fromEnv;

	// 2) fall back to reading the k8s secret (never stored in the repo)
	try {
		const out = execFileSync(
			'kubectl',
			['get', 'secret', 'mongo-secret', '-o', 'json'],
			{ stdio: ['ignore', 'pipe', 'pipe'] },
		).toString();
		const data = JSON.parse(out).data || {};
		const uris = {};
		for (const [svc, key] of Object.entries(MONGO_SECRET_KEYS)) {
			if (!data[key]) {
				throw new Error(`mongo-secret is missing key "${key}"`);
			}
			uris[svc] = Buffer.from(data[key], 'base64').toString('utf8');
		}
		return uris;
	} catch (err) {
		console.error('\n✖ Could not resolve Mongo connection strings.');
		console.error('  Provide them as env vars (AUTH_MONGO_URI, TICKETS_MONGO_URI,');
		console.error('  ORDERS_MONGO_URI, PAYMENTS_MONGO_URI) or make sure `kubectl`');
		console.error('  can read the `mongo-secret` secret in the current context.\n');
		console.error(`  Underlying error: ${err.message}`);
		process.exit(1);
	}
}

async function resetDatabases(uris) {
	for (const [svc, uri] of Object.entries(uris)) {
		const client = new MongoClient(uri);
		try {
			await client.connect();
			const db = client.db(); // db name comes from the connection string
			// Empty every collection rather than dropDatabase — Atlas readWrite
			// users can delete documents but usually can't drop a database.
			const collections = await db.listCollections().toArray();
			let cleared = 0;
			for (const { name } of collections) {
				const { deletedCount } = await db.collection(name).deleteMany({});
				cleared += deletedCount;
			}
			console.log(
				`  • cleared ${svc} db (${db.databaseName}) — ${cleared} docs across ${collections.length} collections`,
			);
		} finally {
			await client.close();
		}
	}
}

function sessionCookie(setCookieHeader) {
	if (!setCookieHeader) throw new Error('no Set-Cookie header returned by signup');
	const match = setCookieHeader.match(/session=[^;]+/);
	if (!match) throw new Error('session cookie not found in signup response');
	return match[0];
}

async function api(path, { method = 'POST', cookie, body } = {}) {
	const headers = { 'Content-Type': 'application/json' };
	if (cookie) headers.Cookie = cookie;
	if (HOST_HEADER) headers.Host = HOST_HEADER;

	const res = await fetch(`${BASE_URL}${path}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	});

	const text = await res.text();
	if (!res.ok) {
		throw new Error(`${method} ${path} → ${res.status}: ${text}`);
	}
	return { res, data: text ? JSON.parse(text) : null };
}

async function signup(email, password) {
	const { res, data } = await api('/api/users/signup', { body: { email, password } });
	return { cookie: sessionCookie(res.headers.get('set-cookie')), id: data.id };
}

async function signin(email, password) {
	const { res } = await api('/api/users/signin', { body: { email, password } });
	return sessionCookie(res.headers.get('set-cookie'));
}

// Give a demo account a public display name (#18) so sellers show as real names
// instead of opaque handles.
async function setDisplayName(cookie, displayName) {
	await api('/api/users/me', { method: 'PATCH', cookie, body: { displayName } });
}

// Demo accounts start unverified (#7), which would block listing/buying. Flip
// them verified straight in the auth DB so the seed can create tickets — the
// caller re-signs-in afterwards to mint a cookie whose JWT says verified.
async function markUsersVerified(authUri, emails) {
	const client = new MongoClient(authUri);
	try {
		await client.connect();
		await client
			.db()
			.collection('users')
			.updateMany({ email: { $in: emails } }, { $set: { emailVerified: true } });
	} finally {
		await client.close();
	}
}

async function createTicket(cookie, ticket) {
	const { data } = await api('/api/tickets', { cookie, body: ticket });
	return data;
}

// Insert demo seller reviews straight into the reviews db. See the file header
// for why this bypasses the API (no completed order without settling Stripe).
// `userIds` maps owner index (1|2) -> the seeded user's id.
async function seedReviews(reviewsUri, userIds) {
	const client = new MongoClient(reviewsUri);
	try {
		await client.connect();
		const now = Date.now();
		const docs = REVIEWS.map((r) => {
			const createdAt = new Date(now - r.daysAgo * 86400000);
			return {
				_id: new ObjectId(),
				// A real review is one-per-order (unique orderId). These demo rows
				// carry a synthetic order id since there's no settled order behind them.
				orderId: new ObjectId().toHexString(),
				sellerId: userIds[r.seller],
				buyerId: userIds[r.buyer],
				ticketTitle: r.ticketTitle,
				rating: r.rating,
				comment: r.comment,
				createdAt,
				updatedAt: createdAt,
				__v: 0,
			};
		});
		if (docs.length) {
			await client.db().collection('reviews').insertMany(docs);
		}
		return docs.length;
	} finally {
		await client.close();
	}
}

// ---- demo data -----------------------------------------------------------

const TICKETS = [
	{
		owner: 1,
		title: 'Coldplay — Music of the Spheres',
		price: 145,
		eventDate: future(70),
		venue: 'Wembley Stadium, London',
		category: 'Concerts',
		description:
			'Lower tier, aisle seat with a clear stage view. LED wristband included for the light show. Selling at face value.',
		imageUrl: img('1459749411175-04bf5292ceea'),
	},
	{
		owner: 1,
		title: 'Lakers vs Celtics',
		price: 89,
		eventDate: future(38),
		venue: 'Crypto.com Arena, Los Angeles',
		category: 'Sports',
		description: 'Section 109, row 7 — great sightline to the home bench.',
		imageUrl: img('1546519638-68e109498ffc'),
	},
	{
		owner: 1,
		title: 'Hamilton',
		price: 230,
		eventDate: future(96),
		venue: 'Richard Rodgers Theatre, New York',
		category: 'Theater',
		description: 'Orchestra, row F. One of the best seats in the house.',
		imageUrl: img('1503095396549-807759245b35'),
	},
	{
		owner: 1,
		title: 'Glastonbury Festival',
		price: 310,
		eventDate: future(250),
		venue: 'Worthy Farm, Pilton, Somerset',
		category: 'Festivals',
		description: 'Full weekend admission with camping. Wristband transfers in person.',
		imageUrl: img('1533174072545-7a4b6ad7a6c3'),
	},
	{
		owner: 2,
		title: 'Tyler, The Creator',
		price: 120,
		eventDate: future(120),
		venue: 'The Kia Forum, Los Angeles',
		category: 'Concerts',
		description: 'General admission floor. Doors at 7, show at 8.',
		imageUrl: img('1470229722913-7c0e2dbbafd3'),
	},
	{
		owner: 2,
		title: 'Arsenal vs Tottenham',
		price: 175,
		eventDate: future(150),
		venue: 'Emirates Stadium, London',
		category: 'Sports',
		description: 'North London derby. Block 26, row 12 — home end.',
		imageUrl: img('1522778119026-d647f0596c20'),
	},
	{
		owner: 2,
		title: 'Taylor Swift — The Eras Tour',
		price: 260,
		eventDate: future(300),
		venue: 'SoFi Stadium, Los Angeles',
		category: 'Concerts',
		description: 'VIP package — early entry and a clear view of the main stage.',
		imageUrl: img('1501281668745-f7f57925c3b4'),
	},
	{
		owner: 2,
		title: 'Cirque du Soleil — KÀ',
		price: 135,
		eventDate: future(60),
		venue: 'MGM Grand, Las Vegas',
		category: 'Theater',
		description: 'Center section, premium tier. An unforgettable evening.',
		imageUrl: img('1514525253161-7a46d19cd819'),
	},
];

// Demo seller reviews (#9). `seller`/`buyer` are owner indexes (1 = test,
// 2 = test2); `ticketTitle` references one of that seller's listings above.
const REVIEWS = [
	// test (1) as the seller, reviewed by test2 (2) → avg 4.7 over 3.
	{ seller: 1, buyer: 2, ticketTitle: 'Coldplay — Music of the Spheres', rating: 5, daysAgo: 14, comment: 'Smooth handoff — tickets transferred within minutes, exactly as listed.' },
	{ seller: 1, buyer: 2, ticketTitle: 'Hamilton', rating: 4, daysAgo: 9, comment: 'Great seats and quick to respond. Would buy from again.' },
	{ seller: 1, buyer: 2, ticketTitle: 'Lakers vs Celtics', rating: 5, daysAgo: 21, comment: 'Legit seller, no issues at the gate.' },
	// test2 (2) as the seller, reviewed by test (1) → avg 4.0 over 3.
	{ seller: 2, buyer: 1, ticketTitle: 'Taylor Swift — The Eras Tour', rating: 5, daysAgo: 6, comment: 'Flawless. Instant transfer and a perfect view of the stage.' },
	{ seller: 2, buyer: 1, ticketTitle: 'Arsenal vs Tottenham', rating: 4, daysAgo: 18, comment: 'Good communication, everything went smoothly on the day.' },
	{ seller: 2, buyer: 1, ticketTitle: 'Tyler, The Creator', rating: 3, daysAgo: 30, comment: 'Tickets were fine but the transfer took a day to come through.' },
];

// ---- run -----------------------------------------------------------------

(async () => {
	console.log(`\nTicketHub seed → ${BASE_URL}\n`);

	console.log('Resetting databases…');
	const uris = resolveMongoUris();
	await resetDatabases(uris);

	console.log('\nCreating users…');
	const user1 = await signup('test@test.com', '123456');
	const user2 = await signup('test2@test.com', '123456');
	const userIds = { 1: user1.id, 2: user2.id };

	// Verify both demo accounts, then re-sign-in so their cookies carry
	// emailVerified: true (the gate for listing/buying reads the JWT).
	await markUsersVerified(uris.auth, ['test@test.com', 'test2@test.com']);
	const cookies = {
		1: await signin('test@test.com', '123456'),
		2: await signin('test2@test.com', '123456'),
	};
	// Public display names (#18) so sellers show as names, not opaque handles.
	await setDisplayName(cookies[1], 'Avery Stone');
	await setDisplayName(cookies[2], 'Jordan Reyes');
	console.log('  • test@test.com / 123456 (verified) — Avery Stone');
	console.log('  • test2@test.com / 123456 (verified) — Jordan Reyes');

	console.log('\nCreating tickets…');
	let ok = 0;
	for (const { owner, ...ticket } of TICKETS) {
		try {
			await createTicket(cookies[owner], ticket);
			console.log(`  • [${owner === 1 ? 'test ' : 'test2'}] ${ticket.title}`);
			ok++;
		} catch (err) {
			console.error(`  ✖ failed: ${ticket.title} — ${err.message}`);
		}
	}

	console.log('\nInserting seller reviews…');
	let reviewCount = 0;
	try {
		reviewCount = await seedReviews(uris.reviews, userIds);
		console.log(`  • inserted ${reviewCount} reviews across the two sellers`);
	} catch (err) {
		console.error(`  ✖ failed to seed reviews — ${err.message}`);
	}

	console.log(
		`\n✓ Done. Seeded 2 users, ${ok}/${TICKETS.length} tickets, and ${reviewCount} reviews.\n`,
	);
	process.exit(0);
})().catch((err) => {
	console.error('\n✖ Seed failed:', err.message, '\n');
	process.exit(1);
});
