import '../styles/globals.css';
import buildClient from '../api/build-client';
import Header from '../components/Header';

// This file initializes every page. We import the global stylesheet here
// (Tailwind + our "Admit One" ticket design system) so styling is available
// across all pages without importing it in each individual page component.

const AppComponent = ({ Component, pageProps, currentUser }) => {
	return (
		<>
			{/* warm box-office counter texture + print registration marks */}
			<div className="counter-bg" aria-hidden="true" />
			<span className="regmark tl" aria-hidden="true" />
			<span className="regmark tr" aria-hidden="true" />
			<span className="regmark bl" aria-hidden="true" />
			<span className="regmark br" aria-hidden="true" />

			<Header currentUser={currentUser} />

			<main className="page-main">
				<Component currentUser={currentUser} {...pageProps} />
			</main>

			<footer className="appfoot">
				<div className="appfoot__in">
					<div className="appfoot__big">
						Admit <span className="red">one</span>.<br />Enjoy the show.
					</div>
					<div className="appfoot__meta">
						<b>TicketHub</b> · buy &amp; sell, fan to fan
						<br />Every ticket numbered · every order held at the gate
					</div>
				</div>
			</footer>
		</>
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
