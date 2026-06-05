import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import mongoose from 'mongoose';
import { validateRequest } from '@zeina-tickethub/common';
import { requireGate } from '../middlewares/require-gate';
import { Pass, PassStatus } from '../models/pass';
import { verifyPass } from '../services/code';
import { natsWrapper } from '../nats-wrapper';
import { TicketRedeemedPublisher } from '../events/publishers/ticket-redeemed-publisher';

const router = express.Router();

// The gate scan. Verifies the signed code, then flips the pass issued→redeemed
// with a single ATOMIC conditional update so two simultaneous scans of the same
// QR can never both admit — only one matches `status: issued`. Always 200; the
// `valid` flag tells the scanner whether to open the gate.
router.post(
	'/api/passes/redeem',
	requireGate,
	[body('code').notEmpty().withMessage('code is required')],
	validateRequest,
	async (req: Request, res: Response) => {
		const passId = verifyPass(req.body.code);
		if (!passId || !mongoose.isValidObjectId(passId)) {
			return res.status(200).send({ valid: false, reason: 'invalid' });
		}

		const redeemed = await Pass.findOneAndUpdate(
			{ _id: passId, status: PassStatus.Issued },
			{ $set: { status: PassStatus.Redeemed, redeemedAt: new Date() } },
			{ new: true },
		);

		// No match → never existed, or already redeemed/revoked. Report which.
		if (!redeemed) {
			const current = await Pass.findById(passId);
			const reason = current ? current.status : 'invalid';
			return res.status(200).send({ valid: false, reason });
		}

		await new TicketRedeemedPublisher(natsWrapper.js).publish({
			passId: redeemed.id,
			orderId: redeemed.orderId,
			ticketId: redeemed.ticketId,
			buyerId: redeemed.buyerId,
			redeemedAt: redeemed.redeemedAt!.toISOString(),
		});

		res.status(200).send({
			valid: true,
			eventTitle: redeemed.eventTitle,
			venue: redeemed.venue,
			eventDate: redeemed.eventDate,
			redeemedAt: redeemed.redeemedAt,
		});
	},
);

export { router as redeemRouter };
