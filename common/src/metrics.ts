import client from 'prom-client';
import express, { Request, Response, NextFunction, Router } from 'express';

// One shared Prometheus registry per process. prom-client's default global
// registry is a singleton, so every counter/histogram defined here (and any a
// service defines against `client`) lands on the same registry and shows up on
// /metrics. `service` is added as a default label so a single Prometheus can
// tell the five services apart even before pod relabeling.
export const register = client.register;
register.setDefaultLabels({ service: process.env.SERVICE_NAME ?? 'tickethub' });

// Node/process metrics (event loop lag, heap, CPU, GC, ...).
client.collectDefaultMetrics({ register });

// Re-export prom-client so services can declare domain counters without taking
// their own direct dependency: `new client.Counter({ ... })`.
export { client };

// --- HTTP server metrics -------------------------------------------------

export const httpRequestDuration = new client.Histogram({
	name: 'http_request_duration_seconds',
	help: 'HTTP request duration in seconds',
	labelNames: ['method', 'route', 'status'] as const,
	buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export const httpRequestsTotal = new client.Counter({
	name: 'http_requests_total',
	help: 'Total HTTP requests',
	labelNames: ['method', 'route', 'status'] as const,
});

// Records duration + count per request, labelled by the route *template*
// (e.g. /api/orders/:orderId) rather than the concrete path, so order ids don't
// blow up label cardinality. Mount early, before the body parser.
export const httpMetrics = (req: Request, res: Response, next: NextFunction) => {
	// /metrics scraping shouldn't count itself.
	if (req.path === '/metrics') return next();

	const end = httpRequestDuration.startTimer();
	res.on('finish', () => {
		// req.route is only set once a route matches; fall back to 'unmatched'
		// (a single bucket) for 404s so junk paths can't explode cardinality.
		const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
		const labels = {
			method: req.method,
			route,
			status: String(res.statusCode),
		};
		end(labels);
		httpRequestsTotal.inc(labels);
	});
	next();
};

// --- Event (NATS/JetStream) metrics --------------------------------------
// Incremented by common's base-publisher / base-listener so every service gets
// event throughput, retry, and dead-letter visibility for free.

export const eventsPublished = new client.Counter({
	name: 'events_published_total',
	help: 'Events published to JetStream',
	labelNames: ['subject'] as const,
});

export const eventsProcessed = new client.Counter({
	name: 'events_processed_total',
	help: 'Events processed by a listener, by outcome',
	// result: success | retry | dead_letter
	labelNames: ['subject', 'queue_group', 'result'] as const,
});

export const eventRedeliveries = new client.Counter({
	name: 'event_redeliveries_total',
	help: 'Listener redeliveries (nak) requested',
	labelNames: ['subject', 'queue_group'] as const,
});

// --- Rate limiting (#13) -------------------------------------------------
// Incremented by the rateLimiter middleware whenever a request is throttled,
// so abuse spikes show up on the dashboards.
export const rateLimitRejections = new client.Counter({
	name: 'rate_limit_rejections_total',
	help: 'Requests rejected by a rate limiter, by limiter name',
	labelNames: ['limiter'] as const,
});

// --- /metrics endpoint ---------------------------------------------------

// Shared scrape endpoint so every service exposes metrics identically.
export const metricsRouter = (): Router => {
	const router = express.Router();
	router.get('/metrics', async (_req: Request, res: Response) => {
		res.set('Content-Type', register.contentType);
		res.end(await register.metrics());
	});
	return router;
};

// For services without an Express app (expiration): render the metrics text
// directly so a raw http handler can serve them.
export const renderMetrics = async (): Promise<{
	contentType: string;
	body: string;
}> => ({
	contentType: register.contentType,
	body: await register.metrics(),
});
