import express, { Request, Response } from 'express';
import { body } from 'express-validator';

import { User, UserDoc } from '../models/user';
import {
	currentUser,
	requireAuth,
	validateRequest,
	NotFoundError,
} from '@zeina-tickethub/common';

const router = express.Router();

// User display names (#18). The name is public, mutable, display-only — it lives
// in auth and is resolved by clients via the read endpoints below, NOT
// propagated as an event/replica (a stale name on another service would be a bug
// with no upside). It is deliberately kept out of the JWT for the same reason.

const MAX_NAME = 40;

// Normalize a submitted name: trim, strip control chars, collapse internal
// whitespace. Returns '' for an all-blank/empty submission (→ clears the name).
const sanitizeName = (raw: unknown): string => {
	if (typeof raw !== 'string') return '';
	return raw
		.replace(/[\x00-\x1f\x7f]/g, '') // strip control chars
		.replace(/\s+/g, ' ')
		.trim();
};

// Public view of a user — only display fields, never email/tokens.
const publicView = (user: UserDoc) => ({
	id: user.id as string,
	displayName: user.displayName ?? null,
});

// PATCH /api/users/me — set or clear your own display name.
// Send { displayName: "Jane" } to set, "" or null to clear.
router.patch(
	'/api/users/me',
	currentUser,
	requireAuth,
	[
		body('displayName')
			.custom((value) => sanitizeName(value).length <= MAX_NAME)
			.withMessage(`Display name must be at most ${MAX_NAME} characters`),
	],
	validateRequest,
	async (req: Request, res: Response) => {
		const name = sanitizeName(req.body.displayName);

		const user = await User.findById(req.currentUser!.id);
		if (!user) {
			throw new NotFoundError();
		}

		// Empty submission clears the name (back to the handle fallback).
		user.set({ displayName: name.length ? name : undefined });
		await user.save();

		res.send(user);
	},
);

// GET /api/users?ids=a,b,c — batch resolve display names (cap 50). Used by the
// client to fill in names for a list of reviews/listings in one round trip.
// Public; returns only display fields. Order/membership not guaranteed (unknown
// ids are simply absent).
router.get(
	'/api/users',
	currentUser,
	async (req: Request, res: Response) => {
		const raw = typeof req.query.ids === 'string' ? req.query.ids : '';
		const ids = raw
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
			.slice(0, 50);

		if (!ids.length) {
			return res.send([]);
		}

		// Ignore malformed ids rather than 400 — a batch read should degrade,
		// not fail, if one id is junk.
		const valid = ids.filter((id) => id.match(/^[0-9a-fA-F]{24}$/));
		if (!valid.length) {
			return res.send([]);
		}

		const users = await User.find({ _id: { $in: valid } });
		res.send(users.map(publicView));
	},
);

// GET /api/users/:id — public display view of a single user. Registered after
// the specific GET routes (currentuser) so it never shadows them.
router.get(
	'/api/users/:id',
	currentUser,
	async (req: Request, res: Response) => {
		const { id } = req.params;
		if (!id.match(/^[0-9a-fA-F]{24}$/)) {
			throw new NotFoundError();
		}

		const user = await User.findById(id);
		if (!user) {
			throw new NotFoundError();
		}

		res.send(publicView(user));
	},
);

export { router as usersRouter };
