import nats, { Stan } from 'node-nats-streaming';

class NatsWrapper {
	private _client?: Stan;
	private _isConnected = false;

	get client() {
		if (!this._client) {
			throw new Error('Cannot access NATS client before connecting');
		}

		return this._client;
	}

	get isConnected() {
		return this._isConnected;
	}

	connect(clusterId: string, clientId: string, url: string): Promise<void> {
		this._client = nats.connect(clusterId, clientId, { url });

		return new Promise((resolve, reject) => {
			this.client.on('connect', () => {
				console.log('Connected to NATS');
				this._isConnected = true;
				resolve();
			});

			this.client.on('error', (err) => {
				this._isConnected = false;
				reject(err);
			});

			this.client.on('close', () => {
				this._isConnected = false;
			});
		});
	}
}

export const natsWrapper = new NatsWrapper();
