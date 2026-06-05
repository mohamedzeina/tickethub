import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import axios from 'axios';
import Stars from './Stars';
import useDisplayName from '../hooks/useDisplayName';

// Seller reputation badge shown on the ticket detail page (#9). The seller's
// aggregate isn't in the ticket payload, so it's resolved separately. When the
// page SSRs it (via `initial`) the badge is present on first paint; otherwise it
// fetches on mount. Renders nothing until loaded; shows a "new seller" note when
// there are no reviews yet so the absence of stars isn't mistaken for a bad
// rating.
const SellerBadge = ({ sellerId, initial = null }) => {
	const router = useRouter();
	// Seed from the SSR-provided state when available so the name/rating don't
	// pop in a second after the page renders.
	const [summary, setSummary] = useState(initial?.summary ?? null);
	const [handle, setHandle] = useState(initial?.handle ?? '');
	// Prefer the seller's chosen display name (#18); fall back to the opaque
	// handle. Seed with the SSR-resolved name so it doesn't flash handle → name.
	const name = useDisplayName(sellerId, initial?.displayName || handle);

	useEffect(() => {
		let active = true;
		if (!sellerId) return;
		// Already handed SSR data → skip the mount fetch (keyed on sellerId so
		// navigating between tickets still refreshes).
		if (initial) return;
		axios
			.get(`/api/reviews/seller/${sellerId}`)
			.then(({ data }) => {
				if (!active) return;
				setSummary(data.summary);
				setHandle(data.handle);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [sellerId]);

	if (!summary) return null;

	return (
		<Link
			href={{
				pathname: '/sellers/[userId]',
				query: { userId: sellerId, from: router.asPath },
			}}
			className="sellerbadge"
		>
			<span className="sellerbadge__who">{name}</span>
			{summary.count > 0 ? (
				<span className="sellerbadge__rate">
					<Stars value={summary.average} size={14} />
					<b>{summary.average.toFixed(1)}</b>
					<span className="sellerbadge__n">({summary.count})</span>
				</span>
			) : (
				<span className="sellerbadge__new">No reviews yet</span>
			)}
		</Link>
	);
};

export default SellerBadge;
