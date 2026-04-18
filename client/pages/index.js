import axios from 'axios';

const LandingPage = ({ currentUser }) => {
	console.log(currentUser);
	// axios.get('/api/users/currentuser').catch((err) => {
	// 	console.log(err.message);
	// });

	return <h1>Landing Page</h1>;
};

// This function runs on the server during the initial page load, and also on the
// client during client-side navigation. It allows us to fetch data and pass it
// as props to the component.
LandingPage.getInitialProps = async () => {
	if (typeof window === 'undefined') {
		// We are on the server, make request to
		// http://ingress-nginx-controller.ingress-nginx.svc.cluster.local
		const { data } = await axios.get(
			'http://ingress-nginx-controller.ingress-nginx.svc.cluster.local/api/users/currentuser',
			{
				headers: {
					host: 'tickethub.com',
				},
			},
		);
		return data;
	} else {
		// We are on the browser, make request to /api/users/currentuser
		const { data } = await axios.get('/api/users/currentuser');
		return data;
	}
};

export default LandingPage;
