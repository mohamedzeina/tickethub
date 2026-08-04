import { Review } from '../models/review';

export interface SellerSummary {
	sellerId: string;
	average: number;
	count: number;
}

// The one definition of a seller's aggregate rating, over ALL their visible
// reviews. Soft-hidden reviews (refunded orders, Option A) never count toward
// reputation.
//
// Shared so the seller profile and the browse-grid badge can't disagree — they
// used to: the profile derived count/average from the same `.limit(50)` page it
// rendered, so a seller with more than 50 reviews showed "50" on their profile
// and their true count on every listing badge.
//
// Sellers with no visible reviews are simply absent from the result (the badge
// omits them; the profile falls back to a zero summary).
export const sellerSummaries = async (
	ids: string[],
): Promise<SellerSummary[]> => {
	if (!ids.length) {
		return [];
	}

	const groups = await Review.aggregate([
		{ $match: { sellerId: { $in: ids }, hidden: { $ne: true } } },
		{
			$group: {
				_id: '$sellerId',
				sum: { $sum: '$rating' },
				count: { $sum: 1 },
			},
		},
	]);

	return groups.map((g) => ({
		sellerId: g._id,
		average: Math.round((g.sum / g.count) * 10) / 10,
		count: g.count,
	}));
};
