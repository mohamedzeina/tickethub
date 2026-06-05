import { useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import PayoutNudge from '../components/PayoutNudge';
import { formatPrice, formatDateShort, serialFromId } from '../utils/ticket';

// status derived from the two flags the tickets service exposes:
//  - orderId present → reserved/sold
//  - unlisted        → hidden from the marketplace by the seller
const statusOf = (ticket) => {
	if (ticket.orderId) return { cls: 'stamp--pending', label: 'Reserved' };
	if (ticket.unlisted) return { cls: 'stamp--muted', label: 'Unlisted' };
	return { cls: 'stamp--paid', label: 'On Sale' };
};

const ListingRow = ({ ticket, onChange }) => {
	const [busy, setBusy] = useState(false);
	const date = formatDateShort(ticket.eventDate);
	const meta = [date, ticket.venue].filter(Boolean).join(' · ');
	const status = statusOf(ticket);
	const reserved = Boolean(ticket.orderId);

	const act = async (request) => {
		setBusy(true);
		try {
			const { data } = await request();
			onChange(ticket.id, { unlisted: data.unlisted });
		} catch (err) {
			// Surface nothing fancy here — refetch on next load reflects truth.
		} finally {
			setBusy(false);
		}
	};

	const unlist = () => act(() => axios.delete(`/api/tickets/${ticket.id}`));
	const relist = () => act(() => axios.post(`/api/tickets/${ticket.id}/relist`));

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
				<span className={`stamp ${status.cls}`}>{status.label}</span>

				{/* Edit available on any unreserved ticket (listed or unlisted) */}
				{!reserved && (
					<Link
						href="/tickets/edit/[ticketId]"
						as={`/tickets/edit/${ticket.id}`}
						className="btn btn--line"
					>
						Edit
					</Link>
				)}

				{!reserved && !ticket.unlisted && (
					<button
						type="button"
						className="btn btn--line"
						onClick={unlist}
						disabled={busy}
					>
						{busy ? 'Unlisting…' : 'Unlist'}
					</button>
				)}

				{!reserved && ticket.unlisted && (
					<button
						type="button"
						className="btn btn--red"
						onClick={relist}
						disabled={busy}
					>
						{busy ? 'Relisting…' : 'Relist'}
					</button>
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
	const [items, setItems] = useState(listings || []);

	const onChange = (id, patch) =>
		setItems((prev) =>
			prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
		);

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
					{items.length} {items.length === 1 ? 'Listing' : 'Listings'}
				</div>
			</div>

			{/* Only a seller (someone with listings) sees the payout nudge — the
			    empty state already drives them to list first. */}
			{items.length > 0 && <PayoutNudge currentUser={currentUser} />}

			{items.length === 0 ? (
				<div className="empty stocked bordered">
					<h3>Nothing listed yet</h3>
					<p>List a ticket to sell and it&apos;ll show up here.</p>
					<Link href="/tickets/new" className="btn btn--red" style={{ marginTop: 22 }}>
						Sell a Ticket
					</Link>
				</div>
			) : (
				<ul className="orders">
					{items.map((ticket) => (
						<ListingRow key={ticket.id} ticket={ticket} onChange={onChange} />
					))}
				</ul>
			)}
		</div>
	);
};

// Returns every ticket this user owns — available, reserved, and unlisted.
// Skipped when signed out (the endpoint requires auth and the page prompts).
Listings.getInitialProps = async (context, client, currentUser) => {
	if (!currentUser) {
		return { listings: [] };
	}

	const { data } = await client.get('/api/tickets/mine');
	return { listings: data };
};

export default Listings;
