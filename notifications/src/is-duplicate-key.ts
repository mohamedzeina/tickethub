// Mongo error 11000 = duplicate key. The sparse unique index on
// Notification.dedupeKey is what makes a redelivered event a no-op rather than a
// duplicate feed row, so the losing writer recognises its collision here.
// (Belongs in common eventually — auth, payments and admission each carry an
// identical copy.)
export const isDuplicateKey = (err: unknown): boolean =>
	(err as { code?: number } | null)?.code === 11000;
