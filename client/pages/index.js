import Link from 'next/link';
import { useMemo, useState } from 'react';

const formatPrice = (price) =>
	new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	}).format(Number(price) || 0);

const formatDate = (value) =>
	value
		? new Intl.DateTimeFormat('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
		  }).format(new Date(value))
		: null;

const SearchIcon = (props) => (
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth={2}
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
		{...props}
	>
		<circle cx="11" cy="11" r="7" />
		<path d="m21 21-4.3-4.3" />
	</svg>
);

const CalendarIcon = (props) => (
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth={1.8}
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
		{...props}
	>
		<rect x="3" y="4" width="18" height="18" rx="2" />
		<path d="M16 2v4M8 2v4M3 10h18" />
	</svg>
);

const LocationIcon = (props) => (
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth={1.8}
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
		{...props}
	>
		<path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
		<circle cx="12" cy="10" r="2.5" />
	</svg>
);

const TicketIcon = (props) => (
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth={1.5}
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
		{...props}
	>
		<path d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
	</svg>
);

const TicketCard = ({ ticket }) => {
	const date = formatDate(ticket.eventDate);

	return (
		<Link
			href="/tickets/[ticketId]"
			as={`/tickets/${ticket.id}`}
			className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
		>
			<div className="relative h-40 overflow-hidden">
				{ticket.imageUrl ? (
					<img
						src={ticket.imageUrl}
						alt={ticket.title}
						className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-600 to-brand-400 text-white/80">
						<TicketIcon className="h-12 w-12" />
					</div>
				)}
				<span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700 shadow-sm backdrop-blur">
					{ticket.category || 'Event'}
				</span>
			</div>

			<div className="flex flex-1 flex-col p-5">
				<h3 className="line-clamp-2 font-display text-lg font-semibold text-ink">
					{ticket.title}
				</h3>

				<div className="mt-3 space-y-1.5 text-sm text-ink-soft">
					{date && (
						<div className="flex items-center gap-2">
							<CalendarIcon className="h-4 w-4 shrink-0 text-brand-500" />
							<span>{date}</span>
						</div>
					)}
					{ticket.venue && (
						<div className="flex items-center gap-2">
							<LocationIcon className="h-4 w-4 shrink-0 text-brand-500" />
							<span className="line-clamp-1">{ticket.venue}</span>
						</div>
					)}
				</div>

				<div className="mt-5 flex items-end justify-between">
					<div>
						<div className="text-2xl font-bold text-brand-700">
							{formatPrice(ticket.price)}
						</div>
						<div className="text-xs font-medium text-ink-soft">per ticket</div>
					</div>
					<span className="inline-flex items-center gap-1 rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 group-hover:bg-accent-600">
						View
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth={2}
							strokeLinecap="round"
							strokeLinejoin="round"
							className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
							aria-hidden="true"
						>
							<path d="M5 12h14M13 6l6 6-6 6" />
						</svg>
					</span>
				</div>
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
				(t.venue || '').toLowerCase().includes(q),
		);
	}, [query, tickets]);

	return (
		<div className="space-y-12">
			{/* Hero */}
			<section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 px-6 py-12 text-white shadow-lg sm:px-12 sm:py-16">
				<div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
				<div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-accent-400/20 blur-2xl" />
				<div className="relative max-w-2xl">
					<span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
						Buy &amp; sell with confidence
					</span>
					<h1 className="mt-4 font-display text-4xl font-extrabold leading-tight sm:text-5xl">
						Tickets to the moments that matter.
					</h1>
					<p className="mt-4 max-w-xl text-base text-brand-100 sm:text-lg">
						Discover great seats from fellow fans — or list your own in
						seconds. Every transaction is simple, fast, and secure.
					</p>

					<div className="relative mt-8 max-w-md">
						<SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-400" />
						<label htmlFor="ticket-search" className="sr-only">
							Search tickets by event
						</label>
						<input
							id="ticket-search"
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search events, artists, teams..."
							className="w-full rounded-xl border-0 bg-white py-3.5 pl-12 pr-4 text-ink shadow-sm outline-none ring-2 ring-transparent transition placeholder:text-ink-soft/70 focus:ring-accent-400"
						/>
					</div>
				</div>
			</section>

			{/* Ticket listings */}
			<section>
				<div className="mb-6 flex items-end justify-between">
					<div>
						<h2 className="font-display text-2xl font-bold text-ink">
							Browse tickets
						</h2>
						<p className="mt-1 text-sm text-ink-soft">
							{filtered.length}{' '}
							{filtered.length === 1 ? 'listing' : 'listings'} available
						</p>
					</div>
					{currentUser && (
						<Link
							href="/tickets/new"
							className="hidden rounded-lg border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700 transition-colors duration-200 hover:bg-brand-100 sm:inline-block"
						>
							+ List a ticket
						</Link>
					)}
				</div>

				{filtered.length === 0 ? (
					<div className="rounded-2xl border border-dashed border-brand-200 bg-white/60 px-6 py-16 text-center">
						<h3 className="font-display text-lg font-semibold text-ink">
							{query ? 'No tickets match your search' : 'No tickets yet'}
						</h3>
						<p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
							{query
								? 'Try a different event, artist, or team name.'
								: 'Be the first to list a ticket and reach buyers instantly.'}
						</p>
						{!query && currentUser && (
							<Link
								href="/tickets/new"
								className="mt-6 inline-block rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-accent-600"
							>
								Sell a ticket
							</Link>
						)}
					</div>
				) : (
					<div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
						{filtered.map((ticket) => (
							<TicketCard key={ticket.id} ticket={ticket} />
						))}
					</div>
				)}
			</section>
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
