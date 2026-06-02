import { JSONCodec, JsMsg, NatsConnection } from 'nats';
import { Listener, Subjects } from '@zeina-tickethub/common';

const jc = JSONCodec();

// A fake JsMsg with a controllable delivery count and ack/nak/term spies.
const buildMsg = (
	redeliveryCount = 1,
	payload: unknown = { hello: 'world' },
): JsMsg =>
	({
		data: jc.encode(payload),
		seq: 1,
		subject: Subjects.OrderCreated,
		redelivered: redeliveryCount > 1,
		info: { redeliveryCount },
		ack: jest.fn(),
		nak: jest.fn(),
		term: jest.fn(),
		working: jest.fn(),
	}) as unknown as JsMsg;

// A fake NatsConnection whose consumer yields the given messages once, so we can
// drive the base listener's consume loop deterministically.
const fakeConnection = (messages: JsMsg[]): NatsConnection => {
	const consumer = {
		consume: async () =>
			(async function* () {
				for (const m of messages) {
					yield m;
				}
			})(),
	};
	return {
		jetstream: () => ({
			consumers: { get: async () => consumer },
		}),
		jetstreamManager: async () => ({
			consumers: { add: async () => undefined },
		}),
	} as unknown as NatsConnection;
};

// Drives a listener over the given messages and waits for the loop to drain.
const run = async (listener: Listener<any>, messages: JsMsg[]) => {
	// @ts-ignore — swap in the fake connection the constructor stored.
	listener.nc = fakeConnection(messages);
	// @ts-ignore — js is derived from nc.
	listener.js = listener.nc.jetstream();
	await listener.listen();
	// @ts-ignore — await the background consume loop.
	await listener.processing;
};

class TestListener extends Listener<{
	subject: Subjects.OrderCreated;
	data: { hello: string };
}> {
	readonly subject = Subjects.OrderCreated;
	queueGroupName = 'test-queue-group';
	failNext = false;
	versionConflict = false;

	constructor() {
		super({ jetstream: () => ({}) } as unknown as NatsConnection);
	}

	async onMessage(_data: { hello: string }, msg: JsMsg) {
		if (this.versionConflict) {
			const err = new Error('No matching document for version');
			err.name = 'VersionError';
			throw err;
		}
		if (this.failNext) {
			throw new Error('boom');
		}
		msg.ack();
	}
}

it('acks the message when the handler succeeds', async () => {
	const listener = new TestListener();
	const msg = buildMsg();
	await run(listener, [msg]);
	expect(msg.ack).toHaveBeenCalledTimes(1);
});

it('naks (does not ack) when the handler throws below the cap', async () => {
	const listener = new TestListener();
	listener.failNext = true;
	const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	const msg = buildMsg(1);
	await run(listener, [msg]);
	expect(msg.ack).not.toHaveBeenCalled();
	expect(msg.nak).toHaveBeenCalled();
	expect(errSpy).toHaveBeenCalled();
	errSpy.mockRestore();
});

it('logs a version conflict calmly (warn, not error) and naks', async () => {
	const listener = new TestListener();
	listener.versionConflict = true;
	const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
	const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	const msg = buildMsg(1);
	await run(listener, [msg]);
	expect(msg.ack).not.toHaveBeenCalled();
	expect(msg.nak).toHaveBeenCalled();
	expect(warnSpy).toHaveBeenCalled();
	expect(errSpy).not.toHaveBeenCalled();
	warnSpy.mockRestore();
	errSpy.mockRestore();
});

// --- B3: dead-letter handling for poison messages (JetStream max_deliver + term) ---

class FakeDeadLetterStore {
	deadLettered: any[] = [];
	throwOnDeadLetter = false;
	async deadLetter(entry: any) {
		if (this.throwOnDeadLetter) throw new Error('write failed');
		this.deadLettered.push(entry);
	}
}

class PoisonListener extends Listener<{
	subject: Subjects.OrderCreated;
	data: { hello: string };
}> {
	readonly subject = Subjects.OrderCreated;
	queueGroupName = 'test-queue-group';
	store = new FakeDeadLetterStore();

	constructor() {
		super({ jetstream: () => ({}) } as unknown as NatsConnection);
		this.deadLetterStore = this.store;
		this.maxAttempts = 3;
	}

	async onMessage() {
		throw new Error('always fails');
	}
}

it('naks below the cap without dead-lettering', async () => {
	const listener = new PoisonListener();
	const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	const msg = buildMsg(1);
	await run(listener, [msg]);
	expect(listener.store.deadLettered).toHaveLength(0);
	expect(msg.nak).toHaveBeenCalled();
	expect(msg.term).not.toHaveBeenCalled();
	errSpy.mockRestore();
});

it('dead-letters and term()s on the final delivery', async () => {
	const listener = new PoisonListener();
	const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	const msg = buildMsg(3); // redeliveryCount === maxAttempts
	await run(listener, [msg]);
	expect(listener.store.deadLettered).toHaveLength(1);
	const entry = listener.store.deadLettered[0];
	expect(entry.attempts).toBe(3);
	expect(entry.channel).toBe('order:created');
	expect(entry.queueGroup).toBe('test-queue-group');
	expect(entry.data).toBe(JSON.stringify({ hello: 'world' }));
	expect(msg.term).toHaveBeenCalledTimes(1);
	expect(msg.ack).not.toHaveBeenCalled();
	errSpy.mockRestore();
});

it('naks (does not term) if the dead-letter write fails, leaving room to retry', async () => {
	const listener = new PoisonListener();
	listener.store.throwOnDeadLetter = true;
	const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	const msg = buildMsg(3);
	await run(listener, [msg]);
	expect(listener.store.deadLettered).toHaveLength(0);
	expect(msg.term).not.toHaveBeenCalled();
	expect(msg.nak).toHaveBeenCalled();
	errSpy.mockRestore();
});
