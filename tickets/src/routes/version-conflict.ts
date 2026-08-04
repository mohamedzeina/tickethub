import mongoose from 'mongoose';
import { BadRequestError } from '@zeina-tickethub/common';
import { Ticket } from '../models/ticket';

// A concurrent change — most likely a buyer reserving this ticket in the same
// instant — bumps the version, so optimistic concurrency rejects the save.
// Surface a clean 400 instead of an unhandled version error, re-reading the
// listing to tell "someone took a seat" apart from a plain stale write.
// `verb` is what the caller was attempting ('edited' / 'unlisted' / 'relisted').
// Always throws; anything that isn't a VersionError is re-thrown untouched.
export const rethrowVersionConflict = async (
	err: unknown,
	ticketId: string,
	verb: string,
): Promise<never> => {
	if (err instanceof mongoose.Error.VersionError) {
		const latest = await Ticket.findById(ticketId);
		throw new BadRequestError(
			latest && latest.availableQty < latest.quantity
				? `This ticket was just reserved and can no longer be ${verb}`
				: 'This ticket was just updated — reload and try again',
		);
	}
	throw err;
};
