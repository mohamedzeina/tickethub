// Bull opens a Redis connection the moment a queue is constructed, so stand in a
// fake that just captures the processor the module registers — the unit under
// test is that handler, not Bull itself.
const mockProcessors: Array<(job: any) => Promise<void>> = [];
jest.mock('bull', () =>
	jest.fn().mockImplementation(() => ({
		process: (fn: (job: any) => Promise<void>) => {
			mockProcessors.push(fn);
		},
	})),
);

// Control what the publish does so we can fail it on purpose.
const mockPublish = jest.fn();
jest.mock('../../events/publishers/expiration-complete-publisher', () => ({
	ExpirationCompletePublisher: jest.fn().mockImplementation(() => ({
		publish: mockPublish,
	})),
}));

jest.mock('../../nats-wrapper');

import '../expiration-queue';

const processor = mockProcessors[0];
const job = { data: { orderId: 'order-1' } };

beforeEach(() => {
	mockPublish.mockReset();
});

it('publishes expiration:complete for the job’s order', async () => {
	mockPublish.mockResolvedValue(undefined);

	await processor(job);

	expect(mockPublish).toHaveBeenCalledWith({ orderId: 'order-1' });
});

it('fails the job when the publish rejects, so Bull retries', async () => {
	// This is the critical seat-release path: an unawaited publish let Bull mark
	// the job complete while the order never expired (and the rejection became an
	// unhandled rejection). The processor must surface the failure instead.
	mockPublish.mockRejectedValue(new Error('nats unavailable'));

	await expect(processor(job)).rejects.toThrow('nats unavailable');
});
