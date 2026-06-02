// Test double for the JetStream NATS wrapper. `js.publish` is a jest spy that
// route/listener tests assert on; `connection.jetstream()` returns that same js
// so listeners constructed with the connection publish through the spy.
const publish = jest.fn().mockResolvedValue(undefined);

const js = {
	publish,
};

const connection = {
	jetstream: () => js,
	jetstreamManager: async () => ({
		streams: { add: jest.fn(), info: jest.fn() },
		consumers: { add: jest.fn() },
	}),
	closed: () => new Promise(() => {}),
	close: jest.fn().mockResolvedValue(undefined),
};

export const natsWrapper = {
	connection,
	js,
	isConnected: true,
};
