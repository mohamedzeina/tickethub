import Link from 'next/link';

// The signed-out dead-end on a personal page (My Listings, Wishlist): an empty
// ticket-stock panel explaining what lives behind the sign-in, plus the CTA.
// Only the copy differs between pages.
const SignInPrompt = ({ heading, body }) => (
	<div className="container container--mid">
		<div className="empty stocked bordered">
			<h3>{heading}</h3>
			<p>{body}</p>
			<Link href="/auth/signin" className="btn btn--red" style={{ marginTop: 22 }}>
				Sign In
			</Link>
		</div>
	</div>
);

export default SignInPrompt;
