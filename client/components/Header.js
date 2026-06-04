import Link from 'next/link';
import { Plus } from './icons';
import NavSearch from './NavSearch';
import NotificationsBell from './NotificationsBell';
import UserMenu from './UserMenu';

// Box-office marquee nav. Link set depends on auth state:
//  - signed out: Sign In + Sign Up
//  - signed in:  My Orders + My Listings + Sell Tickets (cta); account actions
//                (Account, Sign out) live in the UserMenu dropdown to keep the
//                bar uncluttered.
const Header = ({ currentUser }) => {
	const links = [
		!currentUser && { label: 'Sign In', href: '/auth/signin', variant: 'ghost' },
		!currentUser && { label: 'Sign Up', href: '/auth/signup', variant: 'btn-ghost' },
		currentUser && { label: 'My Orders', href: '/orders', variant: 'ghost' },
		currentUser && { label: 'My Listings', href: '/listings', variant: 'ghost' },
		currentUser && { label: 'Sell Tickets', href: '/tickets/new', variant: 'cta' },
	].filter(Boolean);

	return (
		<div className="nav-shell">
			<nav className="nav">
				<Link href="/" className="brand">
					<span className="brand__ticket">TicketHub</span>
					<span className="brand__sub">Buy &amp; Sell Tickets</span>
				</Link>

				<NavSearch />

				<div className="nav__links">
					{currentUser && <NotificationsBell />}
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
					{currentUser && <UserMenu currentUser={currentUser} />}
				</div>
			</nav>
		</div>
	);
};

export default Header;
