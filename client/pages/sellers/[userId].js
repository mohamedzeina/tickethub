import Link from 'next/link';
import Stars from '../../components/Stars';
import { ArrowLeft } from '../../components/icons';

// Format a review date like "Jun 4, 2026".
const formatDate = (value) => {
	if (!value) return '';
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
};

// Public seller reputation page (#9). Shows the aggregate rating and the most
// recent reviews. The seller is shown by their display name when set (#18),
// otherwise an opaque handle; buyers always appear as opaque handles.
const SellerProfile = ({ profile, sellerId }) => {
	if (!profile) {
		return (
			<div className="container container--mid">
				<div className="willcall stocked bordered">
					<div className="willcall__form">
						<h1>Seller not found</h1>
						<p>We couldn’t load this seller’s reputation.</p>
						<Link href="/" className="btn btn--red btn--block" style={{ marginTop: 20 }}>
							Browse tickets
						</Link>
					</div>
				</div>
			</div>
		);
	}

	const { handle, summary, reviews, displayName } = profile;
	// Prefer the seller's chosen display name (#18); the handle is the fallback.
	const sellerName = displayName || handle;

	return (
		<div className="container container--mid">
			<Link href="/" className="backlink">
				<ArrowLeft /> Back to tickets
			</Link>

			<div className="seller stocked bordered">
				<div className="seller__head">
					<div className="lab">TicketHub Seller</div>
					<div className="seller__handle">{sellerName}</div>
					{summary.count > 0 ? (
						<div className="seller__score">
							<span className="seller__avg">{summary.average.toFixed(1)}</span>
							<Stars value={summary.average} size={20} />
							<span className="seller__count">
								{summary.count} review{summary.count === 1 ? '' : 's'}
							</span>
						</div>
					) : (
						<div className="seller__new">No reviews yet — be the first to buy.</div>
					)}
				</div>

				{reviews.length > 0 && (
					<ul className="seller__list">
						{reviews.map((r) => (
							<li key={r.id} className="srow">
								<div className="srow__top">
									<Stars value={r.rating} size={15} />
									<span className="srow__who">{r.buyerHandle}</span>
									<span className="srow__date">{formatDate(r.createdAt)}</span>
								</div>
								{r.ticketTitle && (
									<div className="srow__ticket">on “{r.ticketTitle}”</div>
								)}
								{r.comment && <p className="srow__cmt">{r.comment}</p>}
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};

SellerProfile.getInitialProps = async (context, client) => {
	const { userId } = context.query;
	try {
		const { data } = await client.get(`/api/reviews/seller/${userId}`);
		// Resolve the seller's display name (#18) alongside the reputation. Best
		// effort: a failure here just leaves the handle as the heading.
		let displayName = null;
		try {
			const user = await client.get(`/api/users/${userId}`);
			displayName = user.data.displayName || null;
		} catch (e) {
			/* fall back to handle */
		}
		return { profile: { ...data, displayName }, sellerId: userId };
	} catch (err) {
		return { profile: null, sellerId: userId };
	}
};

export default SellerProfile;
