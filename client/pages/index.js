import axios from 'axios';

const LandingPage = ({ currentUser }) => {
	return currentUser ? (
		<h1>You are logged in</h1>
	) : (
		<h1>You are NOT logged in</h1>
	);
};

// This function runs on the server during the initial page load, and also on the
// client during client-side navigation. It allows us to fetch data and pass it
// as props to the component.
LandingPage.getInitialProps = async (context, client, currentUser) => {
	return {};
};

export default LandingPage;
