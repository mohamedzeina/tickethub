import { EventEmitter } from 'events';
import { Message, Stan } from 'node-nats-streaming';
import { Listener, Subjects } from '@zeina-tickethub/common';

// A concrete listener whose handler we can steer into success / error / version
// conflict, so we can assert the base-listener's ack + error handling (B2).
class TestListener extends Listener<{
	subject: Subjects.OrderCreated;
	data: { hello: string };
}> {
	readonly subject = Subjects.OrderCreated;
	queueGroupName = 'test-queue-group';
	failNext = false;
	versionConflict = false;

	async onMessage(_data: { hello: string }, msg: Message) {
		if (this.versionConflict) {
			const err = new Error('No matching document for version');
			err.name = 'VersionError';
			throw err;
		}
		if (this.failNext) {
			throw new Error('boom');
		}
		// Success path: handlers ack themselves.
		msg.ack();
	}
}

const setup = () => {
	const subscription = new EventEmitter();
	const subOptions = {
		setManualAckMode() {
			return this;
		},
		setAckWait() {
			return this;
		},
		setDeliverAllAvailable() {
			return this;
		},
		setDurableName() {
			return this;
		},
	};
	const client = {
		subscriptionOptions: () => subOptions,
		subscribe: jest.fn().mockReturnValue(subscription),
	} as unknown as Stan;

	const listener = new TestListener(client);
	return { listener, subscription };
};

const buildMsg = (): Message =>
	({
		getData: () => JSON.stringify({ hello: 'world' }),
		getSequence: () => 1,
		isRedelivered: () => false,
		ack: jest.fn(),
	}) as unknown as Message;

// Let the async message handler settle.
const flush = () => new Promise((resolve) => setImmediate(resolve));

it('acks the message when the handler succeeds', async () => {
	const { listener, subscription } = setup();
	listener.listen();

	const msg = buildMsg();
	subscription.emit('message', msg);
	await flush();

	expect(msg.ack).toHaveBeenCalledTimes(1);
});

it('does not ack when the handler throws, so NATS redelivers', async () => {
	const { listener, subscription } = setup();
	listener.failNext = true;
	const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	listener.listen();

	const msg = buildMsg();
	subscription.emit('message', msg);
	await flush();

	expect(msg.ack).not.toHaveBeenCalled();
	expect(errSpy).toHaveBeenCalled();
	errSpy.mockRestore();
});

it('logs a version conflict calmly (warn, not error) and does not ack', async () => {
	const { listener, subscription } = setup();
	listener.versionConflict = true;
	const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
	const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	listener.listen();

	const msg = buildMsg();
	subscription.emit('message', msg);
	await flush();

	expect(msg.ack).not.toHaveBeenCalled();
	expect(warnSpy).toHaveBeenCalled();
	expect(errSpy).not.toHaveBeenCalled();
	warnSpy.mockRestore();
	errSpy.mockRestore();
});
