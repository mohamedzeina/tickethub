import http from 'http';
import { logger, renderMetrics } from '@zeina-tickethub/common';

import { natsWrapper } from './nats-wrapper';
import { expirationQueue } from './queues/expiration-queue';

// expiration has no Express app, so expose liveness/readiness via a tiny
// built-in http server (no extra dependency). Mirrors common's healthRouter:
// /healthz -> process is up, /readyz -> NATS + Redis are connected.
export const startHealthServer = (port = 3000) => {
	const server = http.createServer((req, res) => {
		const send = (status: number, body: object) => {
			res.writeHead(status, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(body));
		};

		// Prometheus scrape endpoint — expiration has no Express app, so render the
		// shared registry directly.
		if (req.url === '/metrics') {
			renderMetrics()
				.then(({ contentType, body }) => {
					res.writeHead(200, { 'Content-Type': contentType });
					res.end(body);
				})
				.catch(() => send(500, { status: 'error' }));
			return;
		}

		if (req.url === '/healthz') {
			return send(200, { status: 'ok' });
		}

		if (req.url === '/readyz') {
			const nats = natsWrapper.isConnected;
			let redis = false;
			try {
				redis = expirationQueue.client.status === 'ready';
			} catch (err) {
				redis = false;
			}

			const ready = nats && redis;
			return send(ready ? 200 : 503, {
				status: ready ? 'ready' : 'not-ready',
				checks: { nats, redis },
			});
		}

		return send(404, { status: 'not-found' });
	});

	server.listen(port, () => {
		logger.info({ port }, 'health server listening');
	});

	return server;
};
