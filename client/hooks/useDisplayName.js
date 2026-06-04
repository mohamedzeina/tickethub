import { useEffect, useState } from 'react';
import axios from 'axios';

// Resolve a user's public display name (#18) on the client. Names live in auth
// and are read on demand (they're display-only + mutable, so they're never
// propagated into other services' payloads). Falls back to the caller-supplied
// handle until — and if — a name resolves, so the UI never shows a blank.
//
//   const name = useDisplayName(sellerId, handle); // → "Jane Doe" or "Seller A1B2"
const useDisplayName = (id, fallback = '') => {
	const [name, setName] = useState(fallback);

	useEffect(() => {
		setName(fallback);
		if (!id) return;
		let active = true;
		axios
			.get(`/api/users/${id}`)
			.then(({ data }) => {
				if (active && data && data.displayName) setName(data.displayName);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [id, fallback]);

	return name;
};

export default useDisplayName;
