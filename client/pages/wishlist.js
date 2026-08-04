import { useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import TicketCard from '../components/TicketCard';
import SignInPrompt from '../components/SignInPrompt';
import useSellerRatings from '../hooks/useSellerRatings';
import useDisplayNames from '../hooks/useDisplayNames';

// #16 — the current user's saved listings. Reuses <TicketCard> (so seller name +
// rating show, just like the browse grid). Every card here is saved, and the
// only action is remove — so we DELETE explicitly rather than going through the
// generic useWishlist toggle (whose add-vs-remove inference could otherwise
// re-save the item if its id-set hadn't loaded). Entries whose ticket replica
// hasn't arrived are skipped.
const Wishlist = ({ saved, currentUser }) => {
	const [items, setItems] = useState(
		(saved || []).filter((s) => s.ticket),
	);

	const sellerIds = items.map((s) => s.ticket.userId);
	const ratings = useSellerRatings(sellerIds);
	const names = useDisplayNames(sellerIds);

	const remove = async (ticketId) => {
		// Optimistically drop the card; revert if the delete fails.
		const prevItems = items;
		setItems((prev) => prev.filter((s) => s.ticketId !== ticketId));
		try {
			await axios.delete(`/api/wishlists/${ticketId}`);
		} catch (err) {
			setItems(prevItems);
		}
	};

	if (!currentUser) {
		return (
			<SignInPrompt
				heading="Sign in to see your wishlist"
				body="Save listings you&apos;re eyeing and get alerted when the price drops."
			/>
		);
	}

	return (
		<div className="container">
			<div className="sec-head" style={{ marginTop: 0 }}>
				<h2>My Wishlist</h2>
				<div className="count">
					{items.length} {items.length === 1 ? 'Ticket' : 'Tickets'} Saved
				</div>
			</div>

			{items.length === 0 ? (
				<div className="empty stocked bordered">
					<h3>Nothing saved yet</h3>
					<p>
						Tap the heart on any listing to save it here. We&apos;ll email you if
						the price drops.
					</p>
					<Link href="/" className="btn btn--line" style={{ marginTop: 22 }}>
						Browse tickets
					</Link>
				</div>
			) : (
				<div className="grid">
					{items.map((s) => (
						<TicketCard
							key={s.ticketId}
							ticket={s.ticket}
							rating={ratings[s.ticket.userId]}
							sellerName={names[s.ticket.userId]}
							saved={true}
							onToggle={remove}
							currentUser={currentUser}
						/>
					))}
				</div>
			)}
		</div>
	);
};

// Skipped when signed out (the endpoint requires auth and the page prompts).
Wishlist.getInitialProps = async (context, client, currentUser) => {
	if (!currentUser) {
		return { saved: [] };
	}
	try {
		const { data } = await client.get('/api/wishlists');
		return { saved: data };
	} catch (err) {
		return { saved: [] };
	}
};

export default Wishlist;
