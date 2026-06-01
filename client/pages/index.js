import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowRight } from '../components/icons';
import BrowseResults from '../components/BrowseResults';
import { parseTicketQuery } from '../utils/ticketQuery';

const LandingPage = ({ currentUser, tickets, meta, filters }) => {
	// Decorative readout: "this week" is derived from the current page only.
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

					<div className="hero-cta">
						<a href="#results" className="btn btn--ink">
							Browse On Sale Now <ArrowRight />
						</a>
						<Link href="/tickets/new" className="btn btn--line">
							Sell Your Tickets
						</Link>
					</div>

					<div className="hero-meta">
						<div className="m">
							<div className="k">On Sale</div>
							<div className="v">
								{meta.total} {meta.total === 1 ? 'Event' : 'Events'}
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

			<BrowseResults
				basePath="/"
				title="On Sale Now"
				currentUser={currentUser}
				tickets={tickets}
				meta={meta}
				filters={filters}
			/>
		</div>
	);
};

// This function runs on the server during the initial page load, and also on the
// client during client-side navigation. It reads the URL query, asks the tickets
// service to do the search/filter/sort/pagination, and passes the page of results
// plus paging metadata down as props.
LandingPage.getInitialProps = async (context, client) => {
	const { filters, qs } = parseTicketQuery(context.query);
	const { data } = await client.get(`/api/tickets${qs ? `?${qs}` : ''}`);

	return {
		tickets: data.tickets,
		meta: {
			page: data.page,
			limit: data.limit,
			total: data.total,
			totalPages: data.totalPages,
		},
		filters,
	};
};

export default LandingPage;
