import Queue from 'bull';

// Every queue in this service carries the same payload (just the order to act
// on) and talks to the same redis, so the wiring lives here once.
export interface Payload {
	orderId: string;
}

export const makeQueue = (name: string) =>
	new Queue<Payload>(name, {
		redis: {
			host: process.env.REDIS_HOST,
		},
	});
