import { useEffect, useState } from 'react';
import axios from 'axios';

// Batch-resolve display names (#18) for a list of user ids in one round trip —
// the list counterpart to useDisplayName, used by the browse/search grid so each
// card can label its seller without an N+1. Reads auth's public batch endpoint;
// names are display-only + mutable, so they're fetched on demand rather than
// replicated. Returns a map keyed by id (ids without a set name are simply
// absent — the caller falls back to the opaque handle).
//
//   const names = useDisplayNames(tickets.map((t) => t.userId));
//   names[sellerId] // → "Jordan Reyes" or undefined
const useDisplayNames = (ids = []) => {
	const [names, setNames] = useState({});

	// Dedupe + stable key so the effect only refetches when the set changes.
	const unique = Array.from(new Set(ids.filter(Boolean)));
	const key = unique.slice().sort().join(',');

	useEffect(() => {
		if (!unique.length) {
			setNames({});
			return;
		}
		let active = true;
		axios
			.get('/api/users', { params: { ids: unique.join(',') } })
			.then(({ data }) => {
				if (!active || !Array.isArray(data)) return;
				const next = {};
				data.forEach((u) => {
					if (u && u.id && u.displayName) next[u.id] = u.displayName;
				});
				setNames(next);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key]);

	return names;
};

export default useDisplayNames;
