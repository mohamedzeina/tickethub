import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { Bell } from './icons';
import { timeAgo } from '../utils/time';

// Navbar bell: an unread badge + a dropdown of recent notifications. Fetches
// client-side (the feed is personal + changes often, so it's not worth coupling
// to every page's SSR) and polls on a slow interval so the badge stays fresh
// without the user reloading. Only mounted for signed-in users.
const POLL_MS = 45000;
const PANEL_LIMIT = 6;

const NotificationsBell = () => {
	const [items, setItems] = useState([]);
	const [unread, setUnread] = useState(0);
	const [open, setOpen] = useState(false);
	const wrapRef = useRef(null);

	const load = async () => {
		try {
			const { data } = await axios.get('/api/notifications');
			setItems(data.notifications || []);
			setUnread(data.unreadCount || 0);
		} catch (err) {
			// Signed out / transient — leave the bell quiet rather than error.
		}
	};

	useEffect(() => {
		load();
		const id = setInterval(load, POLL_MS);
		return () => clearInterval(id);
	}, []);

	// Close the dropdown on an outside click or Escape.
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

	const markAllRead = async () => {
		// Optimistic — clear the badge immediately, then persist.
		setItems((prev) => prev.map((n) => ({ ...n, read: true })));
		setUnread(0);
		try {
			await axios.post('/api/notifications/read-all');
		} catch (err) {
			load(); // reconcile on failure
		}
	};

	const onItemClick = async (n) => {
		if (!n.read) {
			setItems((prev) =>
				prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
			);
			setUnread((u) => Math.max(0, u - 1));
			try {
				await axios.post(`/api/notifications/${n.id}/read`);
			} catch (err) {
				load();
			}
		}
		setOpen(false);
	};

	const recent = items.slice(0, PANEL_LIMIT);

	return (
		<div className="bell" ref={wrapRef}>
			<button
				type="button"
				className="bell__btn"
				aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
			>
				<Bell style={{ width: 19, height: 19 }} />
				{unread > 0 && (
					<span className="bell__badge">{unread > 9 ? '9+' : unread}</span>
				)}
			</button>

			{open && (
				<div className="bell__panel" role="menu">
					<div className="bell__head">
						<span>Notifications</span>
						{unread > 0 && (
							<button type="button" className="bell__mark" onClick={markAllRead}>
								Mark all read
							</button>
						)}
					</div>

					{recent.length === 0 ? (
						<div className="bell__empty">You&apos;re all caught up.</div>
					) : (
						<ul className="bell__list">
							{recent.map((n) => (
								<li
									key={n.id}
									className={`bell__item${n.read ? '' : ' is-unread'}`}
								>
									<Link
										href="/notifications"
										className="bell__link"
										onClick={() => onItemClick(n)}
									>
										<span className="bell__title">{n.title}</span>
										<span className="bell__body">{n.body}</span>
										<span className="bell__time">{timeAgo(n.createdAt)}</span>
									</Link>
								</li>
							))}
						</ul>
					)}

					<Link
						href="/notifications"
						className="bell__all"
						onClick={() => setOpen(false)}
					>
						See all notifications
					</Link>
				</div>
			)}
		</div>
	);
};

export default NotificationsBell;
