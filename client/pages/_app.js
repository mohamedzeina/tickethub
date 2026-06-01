import '../styles/globals.css';
import buildClient from '../api/build-client';
import Header from '../components/Header';

// This file initializes every page. We import the global stylesheet here
// (Tailwind + our TicketHub design tokens) so styling is available across all
// pages without importing it in each individual page component.

const AppComponent = ({ Component, pageProps, currentUser }) => {
	return (
		<div className="min-h-screen bg-brand-50 text-ink">
			<Header currentUser={currentUser} />
			<main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
				<Component currentUser={currentUser} {...pageProps} />
			</main>
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
		pageProps = await appContext.Component.getInitialProps(
			appContext.ctx,
			client,
			data.currentUser,
		);
	}

	return {
		pageProps,
		...data, // Pass the current user data to all pages as a prop
	};
};

export default AppComponent;
