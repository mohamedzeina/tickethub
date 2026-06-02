import express, { Request, Response, Router } from 'express';

// A readiness check returns true when its dependency is healthy.
type HealthCheck = () => boolean;

interface HealthRouterOptions {
	// Named dependency checks evaluated by /readyz (e.g. { mongo, nats }).
	// Each is passed in by the service so common never imports mongoose/nats
	// directly (which would track a different connection singleton).
	checks?: Record<string, HealthCheck>;
}

// Shared liveness/readiness routes so every service exposes them identically.
// /healthz  -> process is up (liveness)
// /readyz   -> all dependency checks pass (readiness)
export const healthRouter = ({
	checks = {},
}: HealthRouterOptions = {}): Router => {
	const router = express.Router();

	router.get('/healthz', (_req: Request, res: Response) => {
		res.status(200).send({ status: 'ok' });
	});

	router.get('/readyz', (_req: Request, res: Response) => {
		const results: Record<string, boolean> = {};
		let ready = true;

		for (const [name, check] of Object.entries(checks)) {
			let ok = false;
			try {
				ok = check();
			} catch (err) {
				ok = false;
			}
			results[name] = ok;
			if (!ok) {
				ready = false;
			}
		}

		res.status(ready ? 200 : 503).send({
			status: ready ? 'ready' : 'not-ready',
			checks: results,
		});
	});

	return router;
};
