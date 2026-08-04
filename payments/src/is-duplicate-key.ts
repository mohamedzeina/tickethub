// Mongo error 11000 = duplicate key. Our unique indexes are the concurrency
// guard behind every check-then-insert in this service, so the losing writer
// recognises its collision here. (Belongs in common eventually.)
export const isDuplicateKey = (err: unknown): boolean =>
	(err as { code?: number } | null)?.code === 11000;
