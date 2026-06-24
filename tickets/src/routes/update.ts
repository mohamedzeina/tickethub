import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';

import {
	validateRequest,
	NotFoundError,
	requireAuth,
	NotAuthorizedError,
	BadRequestError,
} from '@zeina-tickethub/common';

import { Ticket, TICKET_CATEGORIES } from '../models/ticket';
import { TicketUpdatedPublisher } from '../events/publishers/ticket-updated-publisher';
import { natsWrapper } from '../nats-wrapper';

const router = express.Router();

router.put(
	'/api/tickets/:id',
	requireAuth,
	[
		body('title').not().isEmpty().withMessage('Title is required'),
		body('price')
			.isFloat({ gt: 0 })
			.withMessage('Price must be greater than 0'),
		body('quantity')
			.optional()
			.isInt({ min: 1, max: 20 })
			.withMessage('Quantity must be a whole number between 1 and 20')
			.toInt(),
		body('eventDate')
			.isISO8601()
			.withMessage('A valid event date is required')
			.custom((value) => {
				const eventDate = new Date(value);
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				if (eventDate < today) {
					throw new Error('Event date cannot be in the past');
				}
				return true;
			})
			.toDate(),
		body('venue').trim().not().isEmpty().withMessage('Venue is required'),
		body('description').optional({ checkFalsy: true }).trim(),
		body('category')
			.optional({ checkFalsy: true })
			.isIn(TICKET_CATEGORIES)
			.withMessage('Invalid category'),
		body('imageUrl')
			.optional({ checkFalsy: true })
			.isURL()
			.withMessage('Image must be a valid URL'),
	],
	validateRequest,
	async (req: Request, res: Response) => {
		const ticket = await Ticket.findById(req.params.id);

		if (!ticket) {
			throw new NotFoundError();
		}

		// Block edits once any seat has been reserved or sold (availableQty has
		// dropped below the listed quantity) — the same protection the single-unit
		// orderId check gave, generalised to multi-seat.
		if (ticket.availableQty < ticket.quantity) {
			throw new BadRequestError('Cannot edit a ticket with active reservations');
		}

		if (ticket.userId !== req.currentUser!.id) {
			throw new NotAuthorizedError();
		}

		// Quantity is only editable while fully available (guaranteed above), so the
		// new quantity is also fully available.
		const seats = req.body.quantity ?? ticket.quantity;

		ticket.set({
			title: req.body.title,
			price: req.body.price,
			quantity: seats,
			availableQty: seats,
			eventDate: req.body.eventDate,
			venue: req.body.venue,
			description: req.body.description,
			category: req.body.category || 'Other',
			imageUrl: req.body.imageUrl,
		});

		try {
			await ticket.save();
		} catch (err) {
			// A concurrent change — most likely a buyer reserving this ticket in the
			// same instant — bumps the version, so optimistic concurrency rejects this
			// save. Surface a clean 400 instead of an unhandled version error.
			if (err instanceof mongoose.Error.VersionError) {
				const latest = await Ticket.findById(req.params.id);
				throw new BadRequestError(
					latest && latest.availableQty < latest.quantity
						? 'This ticket was just reserved and can no longer be edited'
						: 'This ticket was just updated — reload and try again',
				);
			}
			throw err;
		}

		new TicketUpdatedPublisher(natsWrapper.js).publish({
			id: ticket.id,
			version: ticket.version,
			title: ticket.title,
			price: ticket.price,
			quantity: ticket.quantity,
			availableQty: ticket.availableQty,
			userId: ticket.userId,
			eventDate: ticket.eventDate?.toISOString(),
			venue: ticket.venue,
			description: ticket.description,
			category: ticket.category,
			imageUrl: ticket.imageUrl,
		});

		res.send(ticket);
	},
);

export { router as updateTicketRouter };
