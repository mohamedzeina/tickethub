import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

// Client state for the current user's wishlist (#16). Loads the saved ticket ids
// once (one cheap call to /api/wishlists/ids) and exposes an optimistic toggle.
// Logged-out users get an empty set and no fetch — the SaveButton handles the
// sign-in prompt. Pass `currentUser` so it refetches on auth change.
//
//   const { isSaved, toggle } = useWishlist(currentUser);
const useWishlist = (currentUser) => {
	const [ids, setIds] = useState(() => new Set());

	useEffect(() => {
		if (!currentUser) {
			setIds(new Set());
			return;
		}
		let active = true;
		axios
			.get('/api/wishlists/ids')
			.then(({ data }) => {
				if (active && data && Array.isArray(data.ids)) {
					setIds(new Set(data.ids));
				}
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [currentUser?.id]);

	const toggle = useCallback(async (ticketId) => {
		if (!ticketId) return;
		let wasSaved = false;
		// Optimistic flip; revert on failure so the UI never lies for long.
		setIds((prev) => {
			wasSaved = prev.has(ticketId);
			const next = new Set(prev);
			if (wasSaved) next.delete(ticketId);
			else next.add(ticketId);
			return next;
		});
		try {
			if (wasSaved) await axios.delete(`/api/wishlists/${ticketId}`);
			else await axios.post('/api/wishlists', { ticketId });
		} catch (err) {
			setIds((prev) => {
				const next = new Set(prev);
				if (wasSaved) next.add(ticketId);
				else next.delete(ticketId);
				return next;
			});
		}
	}, []);

	return {
		isSaved: useCallback((id) => ids.has(id), [ids]),
		toggle,
	};
};

export default useWishlist;
