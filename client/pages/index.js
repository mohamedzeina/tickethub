import axios from 'axios';
import buildClient from '../api/buildClient';

const LandingPage = ({ currentUser }) => {
	console.log(currentUser);

	return <h1>Landing Page</h1>;
};

// This function runs on the server during the initial page load, and also on the
// client during client-side navigation. It allows us to fetch data and pass it
// as props to the component.
LandingPage.getInitialProps = async (context) => {
	const client = buildClient(context);
	const { data } = await client.get('api/users/currentuser');
	return data;
};

export default LandingPage;
