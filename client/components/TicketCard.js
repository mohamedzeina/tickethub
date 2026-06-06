import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowRight } from './icons';
import Stars from './Stars';
import SaveButton from './SaveButton';
import { formatPrice, formatDateShort, serialFromId, sellerHandle } from '../utils/ticket';

// A single listing rendered as an admission ticket: main face + counterfoil stub.
// `rating` is the SELLER's aggregate ({ average, count }) and `sellerName` their
// display name, both batch-resolved by the parent (#9). The seller line makes
// clear the stars belong to the seller, not the event, and links to their
// profile. Absent/zero-count rating → name only (a new seller shouldn't read as
// a bad one). `saved`/`onToggle`/`currentUser` drive the wishlist heart (#16).
const TicketCard = ({ ticket, rating, sellerName, saved, onToggle, currentUser }) => {
	const router = useRouter();
	const date = formatDateShort(ticket.eventDate);
	const when = [date, ticket.venue].filter(Boolean).join(' · ');
	const rated = rating && rating.count > 0;
	const name = sellerName || sellerHandle(ticket.userId);
	// You can't wishlist your own listing — hide the heart on it (the detail page
	// already does this). Manage your own tickets from My Listings instead.
	const isOwn = currentUser && ticket.userId && currentUser.id === ticket.userId;

	// The whole card is already a <Link> to the ticket, so the seller can't be a
	// nested <a>. Navigate programmatically and stop the click from also opening
	// the ticket.
	const goToSeller = (e) => {
		e.preventDefault();
		e.stopPropagation();
		router.push({
			pathname: '/sellers/[userId]',
			query: { userId: ticket.userId, from: router.asPath },
		});
	};

	return (
		<Link
			href="/tickets/[ticketId]"
			as={`/tickets/${ticket.id}`}
			className="tk stocked bordered"
		>
			<div className="tk__main">
				{onToggle && !isOwn && (
					<div className="tk__save">
						<SaveButton
							ticketId={ticket.id}
							saved={saved}
							onToggle={onToggle}
							currentUser={currentUser}
							size={17}
						/>
					</div>
				)}
				{ticket.imageUrl && (
					<div className="printed tk__photo">
						<img src={ticket.imageUrl} alt={ticket.title} />
					</div>
				)}

				<span className="tk__cat">{ticket.category || 'Event'}</span>
				<div className="tk__title">{ticket.title}</div>
				{when && <div className="tk__when">{when}</div>}
				<div className="tk__seller">
					<span className="tk__seller-by">Sold by</span>
					<span
						className="tk__seller-name"
						role="link"
						tabIndex={0}
						onClick={goToSeller}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') goToSeller(e);
						}}
					>
						{name}
					</span>
					{rated && (
						<span
							className="tk__rate"
							title={`Seller rated ${rating.average} out of 5 from ${rating.count} review${rating.count === 1 ? '' : 's'}`}
						>
							<Stars value={rating.average} size={13} />
							<b>{rating.average.toFixed(1)}</b>
							<span className="tk__rate-n">({rating.count})</span>
						</span>
					)}
				</div>

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

export default TicketCard;
