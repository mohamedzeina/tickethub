import Link from 'next/link';
import { formatPrice, formatDateShort, serialFromId } from '../utils/ticket';

// A ticket carries an orderId once it has been reserved/sold, so its presence
// tells us whether the listing is still available.
const ListingRow = ({ ticket }) => {
	const date = formatDateShort(ticket.eventDate);
	const meta = [date, ticket.venue].filter(Boolean).join(' · ');
	const reserved = Boolean(ticket.orderId);

	return (
		<li className="ord stocked bordered">
			<div className="ord__qr">
				<div className="qr" aria-hidden="true" />
			</div>

			<div>
				<div className="ord__title">{ticket.title}</div>
				{meta && <div className="ord__meta">{meta.toUpperCase()}</div>}
				<div className="ord__price">
					{formatPrice(ticket.price)} · No. {serialFromId(ticket.id)}
				</div>
			</div>

			<div className="ord__right">
				<span className={`stamp ${reserved ? 'stamp--pending' : 'stamp--paid'}`}>
					{reserved ? 'Reserved' : 'On Sale'}
				</span>
				{!reserved && (
					<Link
						href="/tickets/edit/[ticketId]"
						as={`/tickets/edit/${ticket.id}`}
						className="btn btn--line"
					>
						Edit
					</Link>
				)}
				<Link
					href="/tickets/[ticketId]"
					as={`/tickets/${ticket.id}`}
					className="btn btn--ink"
				>
					View
				</Link>
			</div>
		</li>
	);
};

const Listings = ({ listings, currentUser }) => {
	if (!currentUser) {
		return (
			<div className="container container--mid">
				<div className="empty stocked bordered">
					<h3>Sign in to see your listings</h3>
					<p>Your listings are the tickets you&apos;ve put up for sale.</p>
					<Link href="/auth/signin" className="btn btn--red" style={{ marginTop: 22 }}>
						Sign In
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="container container--mid">
			<div className="sec-head" style={{ marginTop: 0 }}>
				<h2>My Listings</h2>
				<div className="count">
					{listings.length} {listings.length === 1 ? 'Listing' : 'Listings'}
				</div>
			</div>

			{listings.length === 0 ? (
				<div className="empty stocked bordered">
					<h3>Nothing listed yet</h3>
					<p>List a ticket to sell and it&apos;ll show up here.</p>
					<Link href="/tickets/new" className="btn btn--red" style={{ marginTop: 22 }}>
						Sell a Ticket
					</Link>
				</div>
			) : (
				<ul className="orders">
					{listings.map((ticket) => (
						<ListingRow key={ticket.id} ticket={ticket} />
					))}
				</ul>
			)}
		</div>
	);
};

// Returns every ticket this user owns — available, reserved, and sold. Skipped
// when signed out (the endpoint requires auth and the page shows a prompt).
Listings.getInitialProps = async (context, client, currentUser) => {
	if (!currentUser) {
		return { listings: [] };
	}

	const { data } = await client.get('/api/tickets/mine');
	return { listings: data };
};

export default Listings;
