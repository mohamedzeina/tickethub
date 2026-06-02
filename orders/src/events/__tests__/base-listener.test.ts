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

// --- B3: dead-letter handling for poison messages ---

// In-memory DeadLetterStore. recordFailure accumulates by (channel, sequence),
// so redeliveries of the same message return a rising attempt count.
class FakeDeadLetterStore {
	failures = new Map<string, number>();
	deadLettered: any[] = [];
	throwOnRecord = false;
	throwOnDeadLetter = false;

	async recordFailure(channel: string, sequence: number) {
		if (this.throwOnRecord) throw new Error('store down');
		const key = `${channel}:${sequence}`;
		const n = (this.failures.get(key) ?? 0) + 1;
		this.failures.set(key, n);
		return n;
	}

	async deadLetter(entry: any) {
		if (this.throwOnDeadLetter) throw new Error('write failed');
		this.deadLettered.push(entry);
	}
}

// A listener that always fails, with a small cap so the dead-letter threshold is
// reachable in a test.
class PoisonListener extends Listener<{
	subject: Subjects.OrderCreated;
	data: { hello: string };
}> {
	readonly subject = Subjects.OrderCreated;
	queueGroupName = 'test-queue-group';
	store = new FakeDeadLetterStore();

	constructor(client: Stan) {
		super(client);
		this.deadLetterStore = this.store;
		this.maxAttempts = 3;
	}

	async onMessage(_data: { hello: string }, _msg: Message) {
		throw new Error('always fails');
	}
}

const setupPoison = () => {
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

	const listener = new PoisonListener(client);
	return { listener, subscription, store: listener.store };
};

it('counts failures but does not ack or dead-letter below the cap', async () => {
	const { listener, subscription, store } = setupPoison();
	const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	listener.listen();

	// Two deliveries, cap is 3.
	const m1 = buildMsg();
	const m2 = buildMsg();
	subscription.emit('message', m1);
	await flush();
	subscription.emit('message', m2);
	await flush();

	expect(store.failures.get('order:created:1')).toBe(2);
	expect(store.deadLettered).toHaveLength(0);
	expect(m1.ack).not.toHaveBeenCalled();
	expect(m2.ack).not.toHaveBeenCalled();
	errSpy.mockRestore();
});

it('dead-letters and acks once the attempt cap is reached', async () => {
	const { listener, subscription, store } = setupPoison();
	const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	listener.listen();

	let last: Message = buildMsg();
	for (let i = 0; i < 3; i++) {
		last = buildMsg();
		subscription.emit('message', last);
		await flush();
	}

	expect(store.deadLettered).toHaveLength(1);
	const entry = store.deadLettered[0];
	expect(entry.attempts).toBe(3);
	expect(entry.channel).toBe('order:created');
	expect(entry.queueGroup).toBe('test-queue-group');
	expect(entry.data).toBe(JSON.stringify({ hello: 'world' }));
	// The poison message is acked so NATS stops redelivering it.
	expect(last.ack).toHaveBeenCalledTimes(1);
	errSpy.mockRestore();
});

it('does not ack if the dead-letter store is unreachable (stays for retry)', async () => {
	const { listener, subscription, store } = setupPoison();
	store.throwOnRecord = true;
	const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	listener.listen();

	const msg = buildMsg();
	subscription.emit('message', msg);
	await flush();

	expect(store.deadLettered).toHaveLength(0);
	expect(msg.ack).not.toHaveBeenCalled();
	expect(errSpy).toHaveBeenCalled();
	errSpy.mockRestore();
});

it('does not ack if archiving the dead-letter fails (stays for retry)', async () => {
	const { listener, subscription, store } = setupPoison();
	store.throwOnDeadLetter = true;
	const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	listener.listen();

	let last: Message = buildMsg();
	for (let i = 0; i < 3; i++) {
		last = buildMsg();
		subscription.emit('message', last);
		await flush();
	}

	expect(store.deadLettered).toHaveLength(0);
	expect(last.ack).not.toHaveBeenCalled();
	errSpy.mockRestore();
});
