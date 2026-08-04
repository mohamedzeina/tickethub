import { connect, JetStreamClient, NatsConnection } from 'nats';
import { logger } from './logger';

// Wraps a single NATS 2.x (JetStream) connection per service. Exposes the raw
// connection (for stream/consumer setup + lifecycle) and a JetStream client (for
// publishing). `isConnected` backs the /readyz probe.
//
// Lives here because all nine services had a byte-identical copy. Each keeps a
// thin `src/nats-wrapper.ts` re-exporting this, so existing imports and the
// per-service `__mocks__/nats-wrapper.ts` jest mocks keep working unchanged.
class NatsWrapper {
	private _nc?: NatsConnection;
	private _js?: JetStreamClient;
	private _closed = true;

	get connection() {
		if (!this._nc) {
			throw new Error('Cannot access NATS connection before connecting');
		}
		return this._nc;
	}

	get js() {
		if (!this._js) {
			throw new Error('Cannot access JetStream before connecting');
		}
		return this._js;
	}

	get isConnected() {
		return !!this._nc && !this._closed;
	}

	async connect(servers: string, name: string): Promise<void> {
		this._nc = await connect({ servers, name });
		this._js = this._nc.jetstream();
		this._closed = false;
		// Flip the readiness flag when the connection finally closes.
		this._nc.closed().then(() => {
			this._closed = true;
		});
		logger.info('connected to NATS');
	}
}

// One per process. Services import this via their own src/nats-wrapper.ts.
export const natsWrapper = new NatsWrapper();
