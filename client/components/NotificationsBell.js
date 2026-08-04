import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Router from 'next/router';
import axios from 'axios';
import { Bell } from './icons';
import useDismiss from '../hooks/useDismiss';
import { timeAgo } from '../utils/time';

// Navbar bell: an unread badge + a dropdown of recent notifications. Fetches
// client-side (the feed is personal + changes often, so it's not worth coupling
// to every page's SSR). The bell lives in the persistent Header, so it never
// remounts on navigation — it refreshes on a steady poll, on every client-side
// route change, and when the tab regains focus, so the badge stays current
// without a manual reload. Only mounted for signed-in users.
const POLL_MS = 20000;
// Notifications are created asynchronously off events (e.g. reserving a ticket
// publishes order:created, which the notifications service turns into a
// "Reservation placed" item ~1–2s later). A single refetch at navigation time
// can fire before that lands, so we also retry a couple of beats after.
const POST_NAV_REFETCH_MS = [1500, 4000];
const PANEL_LIMIT = 6;
const TOAST_MS = 6000; // how long a toast stays on screen
const MAX_TOASTS = 3; // cap concurrent toasts

const NotificationsBell = () => {
	const [items, setItems] = useState([]);
	const [unread, setUnread] = useState(0);
	const [open, setOpen] = useState(false);
	const [toasts, setToasts] = useState([]);
	// false until the first fetch returns, so the panel shows a skeleton instead
	// of flashing "all caught up" before we actually know.
	const [loaded, setLoaded] = useState(false);
	const wrapRef = useRef(null);
	// IDs we've already seen, so a refetch only toasts genuinely new arrivals.
	const seenRef = useRef(new Set());
	// First load just seeds `seen` — we don't toast notifications that already
	// existed when the page loaded, only ones that arrive while you're here.
	const seededRef = useRef(false);
	const toastTimers = useRef([]);

	const dismissToast = (id) =>
		setToasts((prev) => prev.filter((t) => t._key !== id));

	const showToast = (n) => {
		const key = `${n.id}:${n.createdAt}`;
		setToasts((prev) => [...prev, { ...n, _key: key }].slice(-MAX_TOASTS));
		const timer = setTimeout(() => dismissToast(key), TOAST_MS);
		toastTimers.current.push(timer);
	};

	const load = async () => {
		try {
			const { data } = await axios.get('/api/notifications');
			const fetched = data.notifications || [];

			// Toast anything new + unread since the last fetch (skip the first
			// load, which only seeds the baseline).
			if (seededRef.current) {
				fetched
					.filter((n) => !n.read && !seenRef.current.has(n.id))
					.reverse() // oldest-first so the newest ends up on top
					.forEach(showToast);
			}
			fetched.forEach((n) => seenRef.current.add(n.id));
			seededRef.current = true;

			setItems(fetched);
			setUnread(data.unreadCount || 0);
		} catch (err) {
			// Signed out / transient — leave the bell quiet rather than error.
		} finally {
			setLoaded(true);
		}
	};

	useEffect(() => {
		load();
		const id = setInterval(load, POLL_MS);
		const timeouts = [];

		// Refetch after each client-side navigation, plus a couple of delayed
		// retries to catch a notification the just-performed action is still
		// creating asynchronously (reserve → "Reservation placed").
		const onRouteDone = () => {
			load();
			POST_NAV_REFETCH_MS.forEach((ms) =>
				timeouts.push(setTimeout(load, ms)),
			);
		};
		Router.events.on('routeChangeComplete', onRouteDone);

		// Refetch when the user returns to the tab/window.
		const onFocus = () => load();
		const onVisible = () => {
			if (document.visibilityState === 'visible') load();
		};
		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisible);

		// Refetch when another component (the /notifications page) marks items
		// read, so the badge updates immediately instead of waiting for a poll.
		const onChanged = () => load();
		window.addEventListener('notifications:changed', onChanged);

		return () => {
			clearInterval(id);
			timeouts.forEach(clearTimeout);
			toastTimers.current.forEach(clearTimeout);
			Router.events.off('routeChangeComplete', onRouteDone);
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('notifications:changed', onChanged);
		};
	}, []);

	// Close the dropdown on an outside click or Escape.
	useDismiss(wrapRef, open, () => setOpen(false));

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

					{!loaded ? (
						<ul className="bell__list" aria-hidden="true">
							{[0, 1, 2].map((i) => (
								<li key={i} className="bell__item">
									<div className="bell__link">
										<span className="sk" style={{ display: 'block', height: 11, width: '52%', borderRadius: 3 }} />
										<span className="sk" style={{ display: 'block', height: 10, width: '82%', marginTop: 8, borderRadius: 3 }} />
										<span className="sk" style={{ display: 'block', height: 8, width: '30%', marginTop: 8, borderRadius: 3 }} />
									</div>
								</li>
							))}
						</ul>
					) : recent.length === 0 ? (
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

			{toasts.length > 0 && (
				<div className="toast-stack" aria-live="polite">
					{toasts.map((t) => (
						<Link
							key={t._key}
							href="/notifications"
							className="toast"
							onClick={() => dismissToast(t._key)}
						>
							<span className="toast__bar" aria-hidden="true" />
							<span className="toast__body-wrap">
								<span className="toast__title">{t.title}</span>
								<span className="toast__text">{t.body}</span>
							</span>
							<button
								type="button"
								className="toast__close"
								aria-label="Dismiss"
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									dismissToast(t._key);
								}}
							>
								×
							</button>
						</Link>
					))}
				</div>
			)}
		</div>
	);
};

export default NotificationsBell;
