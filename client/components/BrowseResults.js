import Link from 'next/link';
import { useRef } from 'react';
import { useRouter } from 'next/router';
import FilterBar from './FilterBar';
import TicketCard from './TicketCard';
import useSellerRatings from '../hooks/useSellerRatings';
import useDisplayNames from '../hooks/useDisplayNames';
import { ArrowLeft, ArrowRight } from './icons';

// The shared browse experience used by both the landing page and /search:
// filter bar + section header + results grid + pagination. The parent passes
// the data and a basePath; all filter/page changes merge into that route's URL.
const BrowseResults = ({ basePath, title, currentUser, tickets, meta, filters }) => {
	const router = useRouter();
	const resultsRef = useRef(null);

	// Batch-resolve every listed seller's rating + display name in one request
	// each, so cards can label the seller and show their star badge (#9) without
	// an N+1 of per-seller calls.
	const sellerIds = tickets.map((t) => t.userId);
	const ratings = useSellerRatings(sellerIds);
	const names = useDisplayNames(sellerIds);

	// Merge updates into the URL, drop empties, and reset to page 1 whenever a
	// filter changes (so you never land on an out-of-range page). scroll:false
	// keeps the viewport in place instead of jumping to the top.
	const updateQuery = (updates) => {
		const next = { ...router.query, ...updates };
		if (!('page' in updates)) delete next.page;
		Object.keys(next).forEach((k) => {
			if (next[k] === '' || next[k] == null) delete next[k];
		});
		router.push({ pathname: basePath, query: next }, undefined, { scroll: false });
	};

	const scrollToResults = () => {
		resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	const goToPage = (n) => {
		updateQuery({ page: String(n) });
		scrollToResults();
	};

	// Applying a price range nudges the results into view, like paging does.
	const onApplyPrice = (updates) => {
		updateQuery(updates);
		scrollToResults();
	};

	// "Filters" are the refinements (category/price) — not the search term itself,
	// which stays put so clearing filters keeps you within your search.
	const hasFilters = filters.category || filters.minPrice || filters.maxPrice;
	const clearFilters = () => {
		const { q } = router.query;
		router.push(q ? { pathname: basePath, query: { q } } : basePath);
	};

	const page = meta.page;
	const totalPages = meta.totalPages;

	return (
		<>
			<FilterBar
				filters={filters}
				onUpdate={updateQuery}
				onApplyPrice={onApplyPrice}
			/>

			<div className="sec-head" id="results" ref={resultsRef}>
				<h2>{title}</h2>
				<div className="count">
					{meta.total} {meta.total === 1 ? 'Ticket' : 'Tickets'} Available
					{hasFilters && (
						<button type="button" className="clearlink" onClick={clearFilters}>
							Clear filters
						</button>
					)}
				</div>
			</div>

			{tickets.length === 0 ? (
				<div className="empty stocked bordered">
					<h3>
						{filters.q || hasFilters
							? 'No tickets match those filters'
							: 'Nothing on sale yet'}
					</h3>
					<p>
						{filters.q || hasFilters
							? 'Try widening your search, price range, or category.'
							: 'Be the first to issue a ticket and reach buyers instantly.'}
					</p>
					{hasFilters ? (
						<button
							type="button"
							className="btn btn--line"
							style={{ marginTop: 22 }}
							onClick={clearFilters}
						>
							Clear filters
						</button>
					) : filters.q ? (
						<Link href="/" className="btn btn--line" style={{ marginTop: 22 }}>
							Browse all events
						</Link>
					) : (
						currentUser && (
							<Link href="/tickets/new" className="btn btn--red" style={{ marginTop: 22 }}>
								Issue a Ticket
							</Link>
						)
					)}
				</div>
			) : (
				<>
					<div className="grid">
						{tickets.map((ticket) => (
							<TicketCard
									key={ticket.id}
									ticket={ticket}
									rating={ratings[ticket.userId]}
									sellerName={names[ticket.userId]}
								/>
						))}
					</div>

					{totalPages > 1 && (
						<nav className="pager" aria-label="Pagination">
							<button
								type="button"
								className="pager__btn"
								disabled={page <= 1}
								onClick={() => goToPage(page - 1)}
							>
								<ArrowLeft /> Prev
							</button>
							<span className="pager__status">
								Page {page} of {totalPages}
							</span>
							<button
								type="button"
								className="pager__btn"
								disabled={page >= totalPages}
								onClick={() => goToPage(page + 1)}
							>
								Next <ArrowRight />
							</button>
						</nav>
					)}
				</>
			)}
		</>
	);
};

export default BrowseResults;
