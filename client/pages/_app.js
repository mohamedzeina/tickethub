import '../styles/globals.css';
import { Bevan, Spline_Sans, DM_Mono } from 'next/font/google';
import buildClient from '../api/build-client';
import Header from '../components/Header';

// Self-hosted + preloaded at build time so there's no flash of unstyled text.
// Each exposes a CSS variable that globals.css maps to a role token.
const displayFont = Bevan({
	weight: '400',
	subsets: ['latin'],
	variable: '--font-bevan',
	display: 'swap',
});
const uiFont = Spline_Sans({
	weight: ['400', '500', '600', '700'],
	subsets: ['latin'],
	variable: '--font-spline',
	display: 'swap',
});
const monoFont = DM_Mono({
	weight: ['400', '500'],
	subsets: ['latin'],
	variable: '--font-dmmono',
	display: 'swap',
});

const fontVars = `fontvars ${displayFont.variable} ${uiFont.variable} ${monoFont.variable}`;

// This file initializes every page. We import the global stylesheet here
// (Tailwind + our "Admit One" ticket design system) so styling is available
// across all pages without importing it in each individual page component.

const AppComponent = ({ Component, pageProps, currentUser }) => {
	return (
		<div className={fontVars}>
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
		</div>
	);
};

AppComponent.getInitialProps = async (appContext) => {
	const client = buildClient(appContext.ctx);

	// A failed currentuser lookup must NEVER break rendering or a client-side
	// route transition. Previously a rejected request left `data` undefined and
	// the next line threw on `data.currentUser`, which aborted the whole
	// navigation (you'd click a link and get bounced back to the page you were
	// on). Fall back to "signed out" instead.
	let currentUser = null;
	try {
		const { data } = await client.get('/api/users/currentuser');
		currentUser = data?.currentUser ?? null;
	} catch (err) {
		console.error('currentuser lookup failed:', err.message);
	}

	// We need to call the getInitialProps of the individual page component to fetch
	// any data that it needs. This is important because some pages might have
	// their own getInitialProps to fetch specific data, and we want to make sure
	// that still works.
	let pageProps = {};
	if (appContext.Component.getInitialProps) {
		pageProps = await appContext.Component.getInitialProps(
			appContext.ctx,
			client,
			currentUser,
		);
	}

	return { pageProps, currentUser };
};

export default AppComponent;
