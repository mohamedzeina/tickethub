import Link from 'next/link';
import Stars from '../../components/Stars';
import { ArrowLeft } from '../../components/icons';

// Where "back" should go: the page we arrived from (passed as ?from=), with a
// label that fits it. Falls back to the catalog when there's no origin (e.g. a
// direct visit or refresh).
const backTarget = (from) => {
	if (typeof from === 'string' && from.startsWith('/tickets/')) {
		return { href: from, label: 'Back to ticket' };
	}
	if (typeof from === 'string' && from.startsWith('/orders/')) {
		return { href: from, label: 'Back to order' };
	}
	return { href: '/', label: 'Back to tickets' };
};

// Format a review date like "Jun 4, 2026". This is rendered during SSR, so pin
// the timezone to UTC — otherwise the server (pod TZ) and the browser could land
// on different calendar days near midnight and trip a hydration mismatch.
const formatDate = (value) => {
	if (!value) return '';
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC',
	});
};

// Public seller reputation page (#9). Shows the aggregate rating and the most
// recent reviews. The seller is shown by their display name when set (#18),
// otherwise an opaque handle; buyers always appear as opaque handles.
const SellerProfile = ({ profile, sellerId, from }) => {
	const back = backTarget(from);
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
			<Link href={back.href} className="backlink">
				<ArrowLeft /> {back.label}
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
	const { userId, from } = context.query;
	const back = from || null;
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
		return { profile: { ...data, displayName }, sellerId: userId, from: back };
	} catch (err) {
		return { profile: null, sellerId: userId, from: back };
	}
};

export default SellerProfile;
