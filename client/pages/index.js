import Link from 'next/link';
import { useMemo, useState } from 'react';
import { SearchIcon, CalendarIcon, LocationIcon, ArrowRight } from '../components/icons';
import { formatPrice, formatDateShort, serialFromId } from '../utils/ticket';

// A single listing rendered as an admission ticket: main face + counterfoil stub.
const TicketCard = ({ ticket }) => {
	const date = formatDateShort(ticket.eventDate);
	const when = [date, ticket.venue].filter(Boolean).join(' · ');

	return (
		<Link
			href="/tickets/[ticketId]"
			as={`/tickets/${ticket.id}`}
			className="tk stocked bordered"
		>
			<div className="tk__main">
				{ticket.imageUrl && (
					<div className="printed tk__photo">
						<img src={ticket.imageUrl} alt={ticket.title} />
					</div>
				)}

				<span className="tk__cat">{ticket.category || 'Event'}</span>
				<div className="tk__title">{ticket.title}</div>
				{when && <div className="tk__when">{when}</div>}

				<div className="tk__data">
					<div className="data">
						<div className="cell">
							<div className="k">Type</div>
							<div className="v">{ticket.category || 'GA'}</div>
						</div>
						<div className="cell">
							<div className="k">Date</div>
							<div className="v">
								{date ? date.split(',')[0] : 'TBA'}
							</div>
						</div>
						<div className="cell">
							<div className="k">Admit</div>
							<div className="v">One</div>
						</div>
						<div className="cell">
							<div className="k">No.</div>
							<div className="v">{serialFromId(ticket.id)}</div>
						</div>
					</div>
				</div>

				<div className="tk__foot">
					<div className="tk__price">
						{formatPrice(ticket.price)}
						<small>ADMIT ONE</small>
					</div>
					<span className="tk__go">
						View Ticket <ArrowRight />
					</span>
				</div>
			</div>

			<div className="tk__stub">
				<div className="barcode barcode--v" aria-hidden="true" />
				<div className="sn">No. {serialFromId(ticket.id)}</div>
			</div>
		</Link>
	);
};

const LandingPage = ({ currentUser, tickets }) => {
	const [query, setQuery] = useState('');

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return tickets;
		return tickets.filter(
			(t) =>
				t.title.toLowerCase().includes(q) ||
				(t.venue || '').toLowerCase().includes(q) ||
				(t.category || '').toLowerCase().includes(q),
		);
	}, [query, tickets]);

	// Count events happening within the next 7 days for the box-office readout.
	const thisWeek = useMemo(() => {
		const now = Date.now();
		const wk = now + 7 * 24 * 60 * 60 * 1000;
		return tickets.filter((t) => {
			if (!t.eventDate) return false;
			const d = new Date(t.eventDate).getTime();
			return d >= now && d <= wk;
		}).length;
	}, [tickets]);

	return (
		<div className="container">
			{/* Hero — the master season ticket */}
			<div className="hero-ticket stocked bordered">
				<div className="hero-main">
					<div className="admitline">
						<span>Admit&nbsp;One</span>
						<span className="one">No. 00001</span>
					</div>
					<h1>
						Tickets to the nights<br />
						you&apos;ll <span className="ink-red">talk about</span> for years.
					</h1>
					<p className="lede">
						Real seats from real fans — or{' '}
						<b>issue your own in under a minute</b>. Every ticket numbered,
						every order held at the gate for fifteen minutes.
					</p>

					<form className="hero-search" onSubmit={(e) => e.preventDefault()}>
						<span>
							<SearchIcon style={{ width: 19, height: 19 }} />
						</span>
						<label htmlFor="ticket-search" className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
							Search tickets by event
						</label>
						<input
							id="ticket-search"
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search artists, teams, venues…"
							autoComplete="off"
						/>
						<button type="button">Find Seats</button>
					</form>

					<div className="hero-meta">
						<div className="m">
							<div className="k">On Sale</div>
							<div className="v">
								{tickets.length} {tickets.length === 1 ? 'Event' : 'Events'}
							</div>
						</div>
						<div className="m">
							<div className="k">This Week</div>
							<div className="v">{thisWeek} Events</div>
						</div>
						<div className="m">
							<div className="k">Hold</div>
							<div className="v">15:00</div>
						</div>
						<div className="m">
							<div className="k">Pricing</div>
							<div className="v green">Fan to Fan</div>
						</div>
					</div>
				</div>

				<div className="hero-stub">
					<div className="rot">Admit One · Retain This Stub</div>
					<div className="qr" aria-hidden="true" />
					<div className="serial">SEASON&nbsp;2026</div>
				</div>
			</div>

			{/* Browse */}
			<div className="sec-head">
				<h2>On Sale Now</h2>
				<div className="count">
					{filtered.length} {filtered.length === 1 ? 'Ticket' : 'Tickets'} Available
				</div>
			</div>

			{filtered.length === 0 ? (
				<div className="empty stocked bordered">
					<h3>{query ? 'No tickets match that search' : 'Nothing on sale yet'}</h3>
					<p>
						{query
							? 'Try a different artist, team, or venue.'
							: 'Be the first to issue a ticket and reach buyers instantly.'}
					</p>
					{!query && currentUser && (
						<Link href="/tickets/new" className="btn btn--red" style={{ marginTop: 22 }}>
							Issue a Ticket
						</Link>
					)}
				</div>
			) : (
				<div className="grid">
					{filtered.map((ticket) => (
						<TicketCard key={ticket.id} ticket={ticket} />
					))}
				</div>
			)}
		</div>
	);
};

// This function runs on the server during the initial page load, and also on the
// client during client-side navigation. It allows us to fetch data and pass it
// as props to the component.
LandingPage.getInitialProps = async (context, client, currentUser) => {
	const { data } = await client.get('/api/tickets');
	return { tickets: data };
};

export default LandingPage;
