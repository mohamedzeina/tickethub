import Link from 'next/link';
const Header = ({ currentUser }) => {
	return (
		<nav className="navbar navbar-light bg-light">
			<Link className="navbar-brand" href="/">
				TicketHub
			</Link>

			<div className="d-flex justify-content-end">
				<ul className="nav d-flex allign-items-center">
					{currentUser ? 'Sign out' : 'Sign in'}
				</ul>
			</div>
		</nav>
	);
};

export default Header;
