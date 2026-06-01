import Link from 'next/link';
import { ArrowRight } from './icons';
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

export default TicketCard;
