import 'bootstrap/dist/css/bootstrap.min.css';
import buildClient from '../api/buildClient';
import Header from '../components/header';

// This file is used to initialize pages. We are adding this to have a global
// CSS import for Bootstrap, which is required for styling our application.
// By importing the Bootstrap CSS here, it will be available across all pages
// in the application without needing to import it in each individual page component.

const AppComponent = ({ Component, pageProps, currentUser }) => {
	return (
		<div>
			<Header currentUser={currentUser} />
			<Component {...pageProps} />;
		</div>
	);
};

AppComponent.getInitialProps = async (appContext) => {
	const client = buildClient(appContext.ctx);
	const { data } = await client.get('api/users/currentuser').catch((err) => {
		console.log(err.message);
	});

	// We need to call the getInitialProps of the individual page component to fetch
	// any data that it needs. This is important because some pages might have
	// their own getInitialProps to fetch specific data, and we want to make sure
	// that still works.
	let pageProps = {};
	if (appContext.Component.getInitialProps) {
		pageProps = await appContext.Component.getInitialProps(appContext.ctx);
	}

	return {
		pageProps,
		...data, // Pass the current user data to all pages as a prop
	};
};

export default AppComponent;
