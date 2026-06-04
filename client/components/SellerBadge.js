import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import axios from 'axios';
import Stars from './Stars';
import useDisplayName from '../hooks/useDisplayName';

// Seller reputation badge shown on the ticket detail page (#9). Fetches the
// seller's aggregate client-side (the ticket payload doesn't carry it) and links
// to the full profile. Renders nothing until loaded; shows a "new seller" note
// when there are no reviews yet so the absence of stars isn't mistaken for a bad
// rating.
const SellerBadge = ({ sellerId }) => {
	const router = useRouter();
	const [summary, setSummary] = useState(null);
	const [handle, setHandle] = useState('');
	// Prefer the seller's chosen display name (#18); fall back to the opaque handle.
	const name = useDisplayName(sellerId, handle);

	useEffect(() => {
		let active = true;
		if (!sellerId) return;
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
