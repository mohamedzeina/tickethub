import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from './icons';
import useDisplayName from '../hooks/useDisplayName';

// Account dropdown in the navbar (declutters the flat links). The trigger shows
// the user's display name (#18) — falling back to the email local-part until a
// name is set — and the menu holds the low-frequency account actions (Account,
// Sign out). Mirrors NotificationsBell's outside-click / Escape handling.
const initials = (label) =>
	label
		.split(/[\s.@_-]+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0])
		.join('')
		.toUpperCase() || '?';

const UserMenu = ({ currentUser }) => {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef(null);

	const fallback = (currentUser.email || '').split('@')[0];
	const name = useDisplayName(currentUser.id, fallback);

	useEffect(() => {
		if (!open) return;
		const onClick = (e) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
		};
		const onKey = (e) => e.key === 'Escape' && setOpen(false);
		document.addEventListener('mousedown', onClick);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onClick);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	return (
		<div className="usermenu" ref={wrapRef}>
			<button
				type="button"
				className="usermenu__btn"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
			>
				<span className="usermenu__avatar" aria-hidden="true">{initials(name)}</span>
				<span className="usermenu__name">{name}</span>
				<ChevronDown style={{ width: 14, height: 14, opacity: 0.7 }} />
			</button>

			{open && (
				<div className="usermenu__panel" role="menu">
					<div className="usermenu__head">
						<span className="usermenu__hello">Signed in as</span>
						<span className="usermenu__email">{currentUser.email}</span>
					</div>
					<Link href="/account" className="usermenu__item" role="menuitem" onClick={() => setOpen(false)}>
						Account
					</Link>
					<Link href="/auth/signout" className="usermenu__item usermenu__item--quiet" role="menuitem" onClick={() => setOpen(false)}>
						Sign out
					</Link>
				</div>
			)}
		</div>
	);
};

export default UserMenu;
