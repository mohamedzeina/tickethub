// Mongo error 11000 = duplicate key. The unique index on email is the guard
// behind signup's check-then-insert, so the losing writer recognises its
// collision here. (Belongs in common eventually — payments and admission each
// carry an identical copy.)
export const isDuplicateKey = (err: unknown): boolean =>
	(err as { code?: number } | null)?.code === 11000;
