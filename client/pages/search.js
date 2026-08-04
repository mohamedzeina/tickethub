import Link from 'next/link';
import { ArrowLeft } from '../components/icons';
import BrowseResults from '../components/BrowseResults';
import { fetchBrowsePage } from '../utils/ticketQuery';

// Dedicated results page reached from the nav search (or the hero "Find Seats").
// Reuses the same browse experience as the landing page, scoped to the query.
const SearchPage = ({ currentUser, tickets, meta, filters }) => {
	const title = filters.q ? `Results for “${filters.q}”` : 'All Events';

	return (
		<div className="container">
			<Link href="/" className="backlink">
				<ArrowLeft /> Back to browse
			</Link>

			<div className="searchhead">
				<div className="eyebrow">Search</div>
				<h1>{title}</h1>
			</div>

			<BrowseResults
				basePath="/search"
				title="Matching Tickets"
				currentUser={currentUser}
				tickets={tickets}
				meta={meta}
				filters={filters}
			/>
		</div>
	);
};

SearchPage.getInitialProps = (context, client) => fetchBrowsePage(context, client);

export default SearchPage;
