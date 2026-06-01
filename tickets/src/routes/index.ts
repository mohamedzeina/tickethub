import express, { Request, Response } from 'express';
import { query } from 'express-validator';
import { validateRequest } from '@zeina-tickethub/common';
import { Ticket, TICKET_CATEGORIES } from '../models/ticket';

const router = express.Router();

// Sort keys the client may ask for, mapped to Mongo sort specs. "newest" leans on
// the ObjectId's embedded timestamp so we don't need a separate createdAt field.
const SORTS: Record<string, Record<string, 1 | -1>> = {
	newest: { _id: -1 },
	price_asc: { price: 1 },
	price_desc: { price: -1 },
	date_asc: { eventDate: 1 },
};

// Escape user input before building a RegExp so characters like "(" or "*" are
// treated literally instead of altering the query.
const escapeRegex = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get(
	'/api/tickets/',
	[
		query('q').optional().isString().trim(),
		query('category').optional().isIn(TICKET_CATEGORIES),
		query('minPrice').optional().isFloat({ min: 0 }).toFloat(),
		query('maxPrice').optional().isFloat({ min: 0 }).toFloat(),
		query('sort').optional().isIn(Object.keys(SORTS)),
		query('page').optional().isInt({ min: 1 }).toInt(),
		query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
	],
	validateRequest,
	async (req: Request, res: Response) => {
		const q = req.query.q as string | undefined;
		const category = req.query.category as string | undefined;
		const minPrice = req.query.minPrice as number | undefined;
		const maxPrice = req.query.maxPrice as number | undefined;
		const sort = (req.query.sort as string) || 'newest';
		const page = (req.query.page as unknown as number) || 1;
		const limit = (req.query.limit as unknown as number) || 12;

		// Always start from "on sale": unreserved and not unlisted by the seller.
		const filter: Record<string, any> = {
			orderId: undefined,
			unlisted: { $ne: true },
		};

		if (q) {
			const rx = new RegExp(escapeRegex(q), 'i');
			filter.$or = [{ title: rx }, { venue: rx }];
		}
		if (category) {
			filter.category = category;
		}
		if (minPrice !== undefined || maxPrice !== undefined) {
			filter.price = {};
			if (minPrice !== undefined) filter.price.$gte = minPrice;
			if (maxPrice !== undefined) filter.price.$lte = maxPrice;
		}

		const [tickets, total] = await Promise.all([
			Ticket.find(filter)
				.sort(SORTS[sort])
				.skip((page - 1) * limit)
				.limit(limit),
			Ticket.countDocuments(filter),
		]);

		res.send({
			tickets,
			page,
			limit,
			total,
			totalPages: Math.max(1, Math.ceil(total / limit)),
		});
	},
);

export { router as indexTicketRouter };
