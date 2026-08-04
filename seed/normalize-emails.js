#!/usr/bin/env node
/**
 * One-off migration for the auth email-case fix.
 *
 * Auth now stores and looks up emails lowercased. Any account created before
 * that change whose email has an uppercase character is still stored with its
 * original casing, and would no longer be findable at sign-in (the lookup
 * lowercases, the stored value doesn't match). This rewrites those to lowercase.
 *
 * The interesting case is a COLLISION: two rows that differ only by case are two
 * real accounts today, and lowercasing both would make them indistinguishable.
 * There is no safe automatic answer to that — each has its own password, its own
 * orders and its own listings — so this script refuses to write when it finds
 * one, and prints them for a human to merge or rename first.
 *
 * Usage (from the repo root):
 *   npm run normalize-emails             # dry run, reports only
 *   npm run normalize-emails -- --apply  # actually writes
 *
 * Lives beside seed.js because that is where the mongodb driver is installed.
 *
 * Connection string: AUTH_MONGO_URI if set, otherwise read from the k8s
 * `mongo-secret` via kubectl (same resolution the seed script uses).
 */

const { execFileSync } = require('child_process');
const { MongoClient } = require('mongodb');

const APPLY = process.argv.includes('--apply');

function resolveUri() {
	if (process.env.AUTH_MONGO_URI) return process.env.AUTH_MONGO_URI;
	try {
		const out = execFileSync('kubectl', ['get', 'secret', 'mongo-secret', '-o', 'json'], {
			stdio: ['ignore', 'pipe', 'pipe'],
		}).toString();
		const data = JSON.parse(out).data || {};
		if (!data.AUTH_MONGO_URI) throw new Error('mongo-secret has no AUTH_MONGO_URI');
		return Buffer.from(data.AUTH_MONGO_URI, 'base64').toString('utf8');
	} catch (err) {
		console.error('\n✖ Could not resolve the auth Mongo connection string.');
		console.error('  Set AUTH_MONGO_URI, or make sure kubectl can read `mongo-secret`.');
		console.error(`  Underlying error: ${err.message}\n`);
		process.exit(1);
	}
}

(async () => {
	const client = new MongoClient(resolveUri());
	await client.connect();
	const users = client.db().collection('users');

	const all = await users.find({}, { projection: { email: 1 } }).toArray();
	const needsChange = all.filter(
		(u) => typeof u.email === 'string' && u.email !== u.email.trim().toLowerCase(),
	);

	console.log(`\n${all.length} account(s) total, ${needsChange.length} not normalized.`);

	// Group every account by its normalized form to find case-variant duplicates.
	const byNormalized = new Map();
	for (const u of all) {
		if (typeof u.email !== 'string') continue;
		const key = u.email.trim().toLowerCase();
		byNormalized.set(key, [...(byNormalized.get(key) || []), u]);
	}
	const collisions = [...byNormalized.entries()].filter(([, rows]) => rows.length > 1);

	if (collisions.length) {
		console.error(`\n✖ ${collisions.length} collision(s) — these are separate accounts today:`);
		for (const [normalized, rows] of collisions) {
			console.error(`  ${normalized}`);
			for (const r of rows) console.error(`    - ${r._id}  ${r.email}`);
		}
		console.error('\n  Merge or rename these by hand, then re-run. Nothing was written.\n');
		await client.close();
		process.exit(1);
	}

	if (!needsChange.length) {
		console.log('Nothing to do — every email is already normalized.\n');
		await client.close();
		return;
	}

	for (const u of needsChange) {
		console.log(`  ${u.email}  ->  ${u.email.trim().toLowerCase()}`);
	}

	if (!APPLY) {
		console.log(`\nDry run. Re-run with --apply to write these ${needsChange.length} change(s).\n`);
		await client.close();
		return;
	}

	let updated = 0;
	for (const u of needsChange) {
		await users.updateOne({ _id: u._id }, { $set: { email: u.email.trim().toLowerCase() } });
		updated++;
	}
	console.log(`\n✔ Normalized ${updated} account(s).\n`);
	await client.close();
})().catch((err) => {
	console.error(err);
	process.exit(1);
});
