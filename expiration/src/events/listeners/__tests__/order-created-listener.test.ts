import { OrderStatus } from '@zeina-tickethub/common';

// The Bull queues open a Redis connection the moment they're constructed, so mock
// both queue modules — the unit under test is the listener's *scheduling* logic
// (what it enqueues and with what delay), not Bull itself.
jest.mock('../../../queues/expiration-queue', () => ({
	expirationQueue: { add: jest.fn().mockResolvedValue(undefined), client: {} },
}));
jest.mock('../../../queues/warning-queue', () => ({
	warningQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

// Swap the JetStream wrapper for the manual mock in src/__mocks__ (its js.publish
// is a spy). Importing from the real path keeps the NatsConnection type for the
// listener constructor; jest serves the mock at runtime.
jest.mock('../../../nats-wrapper');

import { OrderCreatedListener } from '../order-created-listener';
import { expirationQueue } from '../../../queues/expiration-queue';
import { warningQueue } from '../../../queues/warning-queue';
import { natsWrapper } from '../../../nats-wrapper';

const addExpiration = expirationQueue.add as jest.Mock;
const addWarning = warningQueue.add as jest.Mock;

const buildData = (msFromNow: number) => ({
	id: 'order-1',
	version: 0,
	status: OrderStatus.Created,
	userId: 'user-1',
	userEmail: 'buyer@test.com',
	expiresAt: new Date(Date.now() + msFromNow).toISOString(),
	ticket: { id: 'ticket-1', price: 10, title: 'Show' },
});

const fakeMsg = () => ({ ack: jest.fn() }) as any;

beforeEach(() => {
	addExpiration.mockClear();
	addWarning.mockClear();
});

it('schedules the expiration job at the order’s expiry delay, then acks', async () => {
	const listener = new OrderCreatedListener(natsWrapper.connection);
	const msg = fakeMsg();

	await listener.onMessage(buildData(15 * 60 * 1000), msg); // 15 min hold

	expect(addExpiration).toHaveBeenCalledTimes(1);
	const [payload, opts] = addExpiration.mock.calls[0];
	expect(payload).toEqual({ orderId: 'order-1' });
	// ~15 min out; allow a little slack for the time elapsed during the call.
	expect(opts.delay).toBeLessThanOrEqual(15 * 60 * 1000);
	expect(opts.delay).toBeGreaterThan(15 * 60 * 1000 - 5000);
	expect(msg.ack).toHaveBeenCalled();
});

it('schedules a warning a lead time before expiry', async () => {
	const listener = new OrderCreatedListener(natsWrapper.connection);

	await listener.onMessage(buildData(15 * 60 * 1000), fakeMsg());

	expect(addWarning).toHaveBeenCalledTimes(1);
	const [payload, opts] = addWarning.mock.calls[0];
	expect(payload).toEqual({ orderId: 'order-1' });
	// 15 min − 120 s lead = ~13 min.
	const expected = 15 * 60 * 1000 - 120 * 1000;
	expect(opts.delay).toBeLessThanOrEqual(expected);
	expect(opts.delay).toBeGreaterThan(expected - 5000);
});

it('skips the warning when the hold is shorter than the warning lead', async () => {
	const listener = new OrderCreatedListener(natsWrapper.connection);
	const msg = fakeMsg();

	await listener.onMessage(buildData(30 * 1000), msg); // 30 s hold, lead is 120 s

	// Expiry is still scheduled; the (would-be-past) warning is not.
	expect(addExpiration).toHaveBeenCalledTimes(1);
	expect(addWarning).not.toHaveBeenCalled();
	expect(msg.ack).toHaveBeenCalled();
});
