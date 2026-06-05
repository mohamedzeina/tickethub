import TicketForm from '../../components/TicketForm';
import PayoutNudge from '../../components/PayoutNudge';
import redirect from '../../utils/redirect';
import { signInHref } from '../../utils/returnTo';

// Anyone on this page is, by definition, acting as a seller — so the payout
// nudge always mounts here (it self-hides once payouts are set up).
const NewTicket = ({ currentUser }) => (
	<div className="container container--mid">
		<PayoutNudge currentUser={currentUser} />
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

// Selling requires an account. Gate at the page level so a signed-out visitor
// is sent to sign in (and back here after) before filling out the whole form,
// instead of hitting a 401 on submit. The nav already hides "Sell" when signed
// out — this covers a direct visit / stale link.
NewTicket.getInitialProps = async (context, client, currentUser) => {
	if (!currentUser) {
		redirect(context, signInHref('/tickets/new'));
	}
	return {};
};

export default NewTicket;
