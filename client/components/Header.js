import Link from 'next/link';

// Ticket mark used in the brand logo.
const TicketIcon = (props) => (
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth={1.8}
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
		{...props}
	>
		<path d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
	</svg>
);

// Visual treatment per link role:
//  - cta:     green "transaction" button (Sell Tickets)
//  - primary: brand-purple button (Sign Up)
//  - ghost:   subtle text link (everything else)
const linkClasses = {
	cta: 'rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-accent-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600',
	primary:
		'rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700',
	ghost: 'rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 transition-colors duration-200 hover:bg-brand-100 hover:text-brand-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
};

const Header = ({ currentUser }) => {
	const links = [
		!currentUser && { label: 'Sign In', href: '/auth/signin', variant: 'ghost' },
		!currentUser && { label: 'Sign Up', href: '/auth/signup', variant: 'primary' },
		currentUser && { label: 'My Orders', href: '/orders', variant: 'ghost' },
		currentUser && {
			label: 'Sell Tickets',
			href: '/tickets/new',
			variant: 'cta',
		},
		currentUser && { label: 'Sign Out', href: '/auth/signout', variant: 'ghost' },
	]
		.filter(Boolean)
		.map(({ label, href, variant }) => (
			<li key={href}>
				<Link className={linkClasses[variant]} href={href}>
					{label}
				</Link>
			</li>
		));

	return (
		<nav className="sticky top-0 z-30 border-b border-brand-100 bg-white/90 backdrop-blur">
			<div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
				<Link
					href="/"
					className="flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight text-brand-700 transition-opacity duration-200 hover:opacity-80"
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-sm">
						<TicketIcon className="h-5 w-5" />
					</span>
					TicketHub
				</Link>

				<ul className="flex items-center gap-1 sm:gap-2">{links}</ul>
			</div>
		</nav>
	);
};

export default Header;
