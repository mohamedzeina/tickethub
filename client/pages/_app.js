import 'bootstrap/dist/css/bootstrap.min.css';

// This file is used to initialize pages. We are adding this to have a global
// CSS import for Bootstrap, which is required for styling our application.
// By importing the Bootstrap CSS here, it will be available across all pages
// in the application without needing to import it in each individual page component.

export default ({ Component, pageProps }) => {
	return <Component {...pageProps} />;
};
