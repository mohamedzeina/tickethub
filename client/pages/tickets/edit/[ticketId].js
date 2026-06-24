import Link from 'next/link';
import TicketForm from '../../../components/TicketForm';
import { ArrowLeft } from '../../../components/icons';
import { serialFromId } from '../../../utils/ticket';
import redirect from '../../../utils/redirect';

const EditTicket = ({ ticket }) => {
	// While the getInitialProps guard redirects, there's nothing to render.
	if (!ticket) return null;

	const initialValues = {
		title: ticket.title,
		price: ticket.price,
		quantity: ticket.quantity ?? 1,
		eventDate: ticket.eventDate
			? new Date(ticket.eventDate).toISOString().slice(0, 10)
			: '',
		venue: ticket.venue || '',
		category: ticket.category || 'Concerts',
		description: ticket.description || '',
		imageUrl: ticket.imageUrl || '',
	};

	return (
		<div className="container container--mid">
			<Link href="/listings" className="backlink">
				<ArrowLeft /> Back to my listings
			</Link>
			<TicketForm
				eyebrow={`Editing · No. ${serialFromId(ticket.id)}`}
				heading="Edit Listing"
				subtitle="Update the details — changes go live the moment you save."
				submitLabel="Save Changes"
				url={`/api/tickets/${ticket.id}`}
				method="put"
				redirectTo="/listings"
				initialValues={initialValues}
			/>
		</div>
	);
};

// Only the owner of a fully-available ticket may edit it (mirrors the server's
// PUT /api/tickets/:id rules — #10 blocks edits once any seat is reserved/sold).
// Anyone else is redirected to their listings.
EditTicket.getInitialProps = async (context, client, currentUser) => {
	const { ticketId } = context.query;

	// Never let a failed fetch (bad id, ticket gone, transient error) throw out of
	// getInitialProps — that aborts the route transition and bounces you back to
	// the page you came from. Fall back to a clean redirect to your listings.
	let ticket;
	try {
		const res = await client.get(`/api/tickets/${ticketId}`);
		ticket = res.data;
	} catch (err) {
		redirect(context, '/listings');
		return {};
	}

	const allowed =
		currentUser &&
		ticket.userId === currentUser.id &&
		(ticket.availableQty ?? 1) >= (ticket.quantity ?? 1);

	if (!allowed) {
		redirect(context, '/listings');
		return {};
	}

	return { ticket };
};

export default EditTicket;
