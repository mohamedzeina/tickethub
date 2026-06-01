import Link from 'next/link';
import Router from 'next/router';
import TicketForm from '../../../components/TicketForm';
import { ArrowLeft } from '../../../components/icons';
import { serialFromId } from '../../../utils/ticket';

const EditTicket = ({ ticket }) => {
	// While the getInitialProps guard redirects, there's nothing to render.
	if (!ticket) return null;

	const initialValues = {
		title: ticket.title,
		price: ticket.price,
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

// Only the owner of a not-yet-reserved ticket may edit it (mirrors the server's
// PUT /api/tickets/:id rules). Anyone else is redirected to their listings.
EditTicket.getInitialProps = async (context, client, currentUser) => {
	const { ticketId } = context.query;
	const { data: ticket } = await client.get(`/api/tickets/${ticketId}`);

	const allowed =
		currentUser && ticket.userId === currentUser.id && !ticket.orderId;

	if (!allowed) {
		const dest = '/listings';
		if (context.res) {
			context.res.writeHead(302, { Location: dest });
			context.res.end();
		} else {
			Router.push(dest);
		}
		return {};
	}

	return { ticket };
};

export default EditTicket;
