/**
 * Runs every TicketHub e2e suite against a LIVE cluster, sharing one Reporter,
 * and exits non-zero if any check fails.
 *
 * Prereqs:
 *   • skaffold dev up, all pods Ready
 *   • Mailpit reachable:  kubectl port-forward svc/mailpit-srv 8025:8025
 *   • (full payment settlement also needs `stripe listen`; suites that can't
 *     settle assert up to PaymentIntent creation and say so)
 *
 * Run:  node e2e/run-all.js
 */

const { Reporter, BASE_URL, MAILPIT_URL, ensureMailpit } = require('./lib/harness');

// Order matters a little: auth basics first, then the domains, then the
// cross-service flows that lean on all of them.
const SUITES = [
	'auth-core',
	'account-hardening',
	'abuse',
	'tickets',
	'orders',
	'payments',
	'notifications',
	'reviews',
	'flows',
];

(async () => {
	console.log(`\nTicketHub e2e suite → ${BASE_URL}  (mail: ${MAILPIT_URL})`);

	if (!(await ensureMailpit())) {
		console.error(
			`\n✖ Cannot reach Mailpit at ${MAILPIT_URL}.\n` +
				`  Run:  kubectl port-forward svc/mailpit-srv 8025:8025\n`,
		);
		process.exit(1);
	}

	const t = new Reporter();
	for (const name of SUITES) {
		let run;
		try {
			run = require(`./${name}`);
		} catch (err) {
			t.check(`[${name}] suite failed to load`, false, err.message);
			continue;
		}
		const fn = typeof run === 'function' ? run : run && run.run;
		if (typeof fn !== 'function') {
			t.check(`[${name}] does not export a run(t) function`, false);
			continue;
		}
		console.log(`\n${'═'.repeat(52)}\n  SUITE: ${name}\n${'═'.repeat(52)}`);
		try {
			await fn(t);
		} catch (err) {
			t.check(`[${name}] suite crashed mid-run`, false, err.message);
		}
	}

	process.exit(t.finish() ? 0 : 1);
})();
