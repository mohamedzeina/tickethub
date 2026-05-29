import axios from 'axios';

const LandingPage = ({ currentUser, tickets }) => {
	const ticketList = tickets.map((ticket) => {
		return (
			<tr key={ticket.id}>
				<td>{ticket.title}</td>
				<td>{ticket.price}</td>
			</tr>
		);
	});

	return (
		<div>
			<h1> Tickets</h1>
			<table className="table">
				<thead>
					<tr>
						<th>Title</th>
						<th>Prices</th>
					</tr>
				</thead>
				<tbody>{ticketList}</tbody>
			</table>
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
