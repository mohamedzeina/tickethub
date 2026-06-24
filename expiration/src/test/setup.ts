// Jest setup for the expiration service. Unlike the other services it has no
// Mongo (it's Bull/Redis queue-based), so there's no in-memory DB to spin up —
// the listener tests mock the queues. We just pin the env the listener reads so
// the warning-lead math is deterministic across machines.

process.env.EXPIRATION_WARNING_LEAD_SECONDS =
	process.env.EXPIRATION_WARNING_LEAD_SECONDS || '120';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
