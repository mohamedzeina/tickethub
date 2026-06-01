import TicketForm from '../../components/TicketForm';

const NewTicket = () => (
	<div className="container container--mid">
		<TicketForm
			eyebrow="Fill out a blank · publish instantly"
			heading="Issue a Ticket"
			subtitle="Print your seat to the marketplace — buyers see it the moment you sign it off."
			submitLabel="Sign & Publish Ticket"
			url="/api/tickets"
			method="post"
			redirectTo="/listings"
		/>
	</div>
);

export default NewTicket;
