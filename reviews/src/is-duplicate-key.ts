// Mongo error 11000 = duplicate key. The unique index on orderId is the real
// concurrency guard behind the check-then-insert in the create route, so the
// losing writer recognises its collision here. (Belongs in common eventually.)
export const isDuplicateKey = (err: unknown): boolean =>
	(err as { code?: number } | null)?.code === 11000;
