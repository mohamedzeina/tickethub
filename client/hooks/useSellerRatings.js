import { useEffect, useState } from 'react';
import axios from 'axios';

// Batch-resolve seller rating summaries (#9 per-card ratings) for a list of
// seller ids in one round trip — used by the browse/search grid so each listing
// card can show a star badge without an N+1 of /seller/:id calls. Mirrors the
// #18 display-name resolver: read on demand, degrade silently (a seller missing
// from the response simply has no rating yet). Returns a map keyed by sellerId:
//
//   const ratings = useSellerRatings(tickets.map((t) => t.userId));
//   ratings[sellerId] // → { average, count } or undefined
const useSellerRatings = (ids = []) => {
	const [ratings, setRatings] = useState({});

	// Dedupe + stable key so the effect only refetches when the actual set of
	// sellers changes (not on every render that produces a new array).
	const unique = Array.from(new Set(ids.filter(Boolean)));
	const key = unique.slice().sort().join(',');

	useEffect(() => {
		if (!unique.length) {
			setRatings({});
			return;
		}
		let active = true;
		axios
			.get('/api/reviews/sellers', { params: { ids: unique.join(',') } })
			.then(({ data }) => {
				if (!active || !Array.isArray(data)) return;
				const next = {};
				data.forEach((s) => {
					if (s && s.sellerId) next[s.sellerId] = s.summary;
				});
				setRatings(next);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key]);

	return ratings;
};

export default useSellerRatings;
