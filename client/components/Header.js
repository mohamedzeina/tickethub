import Link from 'next/link';
import { Plus } from './icons';

// Box-office marquee nav. Link set depends on auth state:
//  - signed out: Will Call (sign in) + Sign Up
//  - signed in:  My Tickets + Issue a Ticket (cta) + Sign Out
const Header = ({ currentUser }) => {
	const links = [
		!currentUser && { label: 'Sign In', href: '/auth/signin', variant: 'ghost' },
		!currentUser && { label: 'Sign Up', href: '/auth/signup', variant: 'btn-ghost' },
		currentUser && { label: 'My Tickets', href: '/orders', variant: 'ghost' },
		currentUser && { label: 'Sell Tickets', href: '/tickets/new', variant: 'cta' },
		currentUser && { label: 'Sign Out', href: '/auth/signout', variant: 'ghost' },
	].filter(Boolean);

	return (
		<div className="nav-shell">
			<nav className="nav">
				<Link href="/" className="brand">
					<span className="brand__ticket">TicketHub</span>
					<span className="brand__sub">Buy &amp; Sell Tickets</span>
				</Link>

				<div className="nav__links">
					{links.map(({ label, href, variant }) => {
						if (variant === 'cta') {
							return (
								<Link key={href} href={href} className="btn btn--red">
									<Plus style={{ width: 15, height: 15 }} />
									{label}
								</Link>
							);
						}
						if (variant === 'btn-ghost') {
							return (
								<Link key={href} href={href} className="btn btn--ghost">
									{label}
								</Link>
							);
						}
						return (
							<Link key={href} href={href} className="nlink">
								{label}
							</Link>
						);
					})}
				</div>
			</nav>
		</div>
	);
};

export default Header;
