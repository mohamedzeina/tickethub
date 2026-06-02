import { connect, JetStreamClient, NatsConnection } from 'nats';

// Wraps a single NATS 2.x (JetStream) connection per service. Exposes the raw
// connection (for the listeners' consumer setup + lifecycle) and a JetStream
// client (for publishing). `isConnected` backs the /readyz probe.
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
		console.log('Connected to NATS');
	}
}

export const natsWrapper = new NatsWrapper();
