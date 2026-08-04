import pino from 'pino';
import { pinoHttp, Options } from 'pino-http';
import { IncomingMessage } from 'http';

// One shared logger config for every service. Each service identifies itself
// via SERVICE_NAME (set per container in k8s); falls back to 'tickethub' so a
// missing env never crashes startup. Level is LOG_LEVEL when set, otherwise
// 'silent' under test (keeps jest output clean) and 'info' everywhere else.
const level =
	process.env.LOG_LEVEL ??
	(process.env.NODE_ENV === 'test' ? 'silent' : 'info');

// Also used as the `service` default label on the metrics registry, so logs and
// metrics always agree on what this process calls itself.
export const serviceName = process.env.SERVICE_NAME ?? 'tickethub';

// JSON to stdout (pino default). No pretty transport — log shippers/Grafana
// parse the raw JSON; humans can pipe through `pino-pretty` locally if they want.
export const logger = pino({
	level,
	base: { service: serviceName },
});

// Pull a request id off common proxy/ingress headers so a single request can be
// correlated end-to-end; fall back to pino-http's own generated id.
const requestIdHeader = (req: IncomingMessage): string | undefined => {
	const header = req.headers['x-request-id'] ?? req.headers['x-correlation-id'];
	return Array.isArray(header) ? header[0] : header;
};

const httpOptions: Options = {
	logger,
	// Reuse an inbound request id when present so logs across services line up.
	genReqId: (req, res) => {
		const existing = requestIdHeader(req);
		const id = existing ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
		res.setHeader('x-request-id', id);
		return id;
	},
	// Trim the noise: log the request id + method/url/status, drop the full
	// header dumps. Keeping req.id here is what surfaces the request id on the
	// per-request completion line (req.log children carry it automatically).
	serializers: {
		req: (req) => ({ id: req.id, method: req.method, url: req.url }),
		res: (res) => ({ statusCode: res.statusCode }),
	},
	// Health probes hit /healthz & /readyz constantly — log them at debug so they
	// don't drown out real traffic at the default info level.
	customLogLevel: (req, res, err) => {
		if (err || res.statusCode >= 500) return 'error';
		if (res.statusCode >= 400) return 'warn';
		if (req.url === '/healthz' || req.url === '/readyz') return 'debug';
		return 'info';
	},
};

// Drop-in Express middleware: `app.use(requestLogger)` gives every service the
// same per-request log line plus `req.log` (a child logger bound to the req id).
export const requestLogger = pinoHttp(httpOptions);
