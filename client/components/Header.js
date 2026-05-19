import Link from 'next/link';
const Header = ({ currentUser }) => {
	const links = [
		!currentUser && { label: 'Sign Up', href: '/auth/signup' },
		!currentUser && { label: 'Sign In', href: '/auth/signin' },
		currentUser && { label: 'Sign Out', href: '/auth/signout' },
	]
		.filter((linkConfig) => linkConfig) // Filter out any falsy values (like false or null)
		.map(({ label, href }) => {
			return (
				<li key={href} className="nav-item">
					<Link className="navbar-brand" href={href}>
						{label}
					</Link>
				</li>
			);
		});

	return (
		<nav className="navbar navbar-light bg-light">
			<Link className="navbar-brand" href="/">
				TicketHub
			</Link>

			<div className="d-flex justify-content-end">
				<ul className="nav d-flex allign-items-center">{links}</ul>
			</div>
		</nav>
	);
};

export default Header;
