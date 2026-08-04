// Mongo error 11000 = duplicate key. Unique indexes are the concurrency guard
// behind every check-then-insert in this system, so the losing writer recognises
// its collision here rather than each service re-deriving the untyped cast.
export const isDuplicateKey = (err: unknown): boolean =>
	(err as { code?: number } | null)?.code === 11000;
