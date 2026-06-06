import { useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { timeAgo } from '../utils/time';
import redirect from '../utils/redirect';

// Map a notification type to an "Admit One" stamp accent + short tag.
const tagFor = (type) => {
	switch (type) {
		case 'payment_succeeded':
			return { cls: 'ntag--paid', label: 'Paid' };
		case 'payment_refunded':
			return { cls: 'ntag--refund', label: 'Refund' };
		case 'hold_expiring':
			return { cls: 'ntag--warn', label: 'Expiring' };
		case 'hold_expired':
			return { cls: 'ntag--void', label: 'Released' };
		// Buyer — admission pass scanned at the gate (#5)
		case 'pass_scanned':
			return { cls: 'ntag--paid', label: 'Admitted' };
		// Seller-side (#11)
		case 'ticket_sold':
			return { cls: 'ntag--paid', label: 'Sold' };
		case 'sale_refunded':
			return { cls: 'ntag--refund', label: 'Refund' };
		case 'payout_paid':
			return { cls: 'ntag--paid', label: 'Payout' };
		case 'payout_held':
			return { cls: 'ntag--warn', label: 'Held' };
		default:
			return { cls: 'ntag--hold', label: 'Hold' };
	}
};

// Seller-side notifications carry the *buyer's* orderId (the seller can't open
// it — they'd 401 and get bounced to sign-in). Point them at their earnings hub
// instead. Buyer notifications link to their own order as before.
const SELLER_TYPES = new Set([
	'ticket_sold',
	'sale_refunded',
	'payout_paid',
	'payout_held',
]);

const ctaFor = (n) => {
	if (SELLER_TYPES.has(n.type)) {
		// Query must live on `href` (not just `as`) or router.query.payouts stays
		// empty and the account page won't switch to the Payouts tab.
		return { href: '/account?payouts=1', as: '/account?payouts=1', label: 'View payouts' };
	}
	// Wishlist price-drop (#16) points at the listing.
	if (n.ticketId) {
		return { href: '/tickets/[ticketId]', as: `/tickets/${n.ticketId}`, label: 'View listing' };
	}
	if (n.orderId) {
		return { href: '/orders/[orderId]', as: `/orders/${n.orderId}`, label: 'View order' };
	}
	return null;
};

const NotificationsPage = ({ notifications: initial }) => {
	const [items, setItems] = useState(initial || []);
	const unread = items.filter((n) => !n.read).length;

	// Tell the navbar bell to refetch so its unread badge updates immediately —
	// the bell is a separate component that otherwise only refreshes on a poll.
	const syncBell = () => window.dispatchEvent(new Event('notifications:changed'));

	const markOne = async (n) => {
		if (n.read) return;
		setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
		try {
			await axios.post(`/api/notifications/${n.id}/read`);
			syncBell();
		} catch (err) {
			/* best-effort; the badge reconciles on next load */
		}
	};

	const markAll = async () => {
		setItems((prev) => prev.map((n) => ({ ...n, read: true })));
		try {
			await axios.post('/api/notifications/read-all');
			syncBell();
		} catch (err) {
			/* best-effort */
		}
	};

	return (
		<div className="container container--mid">
			<div className="sec-head" style={{ marginTop: 0 }}>
				<h2>Notifications</h2>
				<div className="count" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
					<span>{unread} unread</span>
					{unread > 0 && (
						<button type="button" className="btn btn--ghost" onClick={markAll}>
							Mark all read
						</button>
					)}
				</div>
			</div>

			{items.length === 0 ? (
				<div className="empty stocked bordered">
					<h3>Nothing here yet</h3>
					<p>Order updates, payment receipts, and hold reminders will show up here.</p>
					<Link href="/" className="btn btn--red" style={{ marginTop: 22 }}>
						Browse tickets
					</Link>
				</div>
			) : (
				<ul className="notes">
					{items.map((n) => {
						const tag = tagFor(n.type);
						const cta = ctaFor(n);
						return (
							<li
								key={n.id}
								className={`note stocked bordered${n.read ? '' : ' is-unread'}`}
								onClick={() => markOne(n)}
							>
								<span className={`ntag ${tag.cls}`}>{tag.label}</span>
								<div className="note__body">
									<div className="note__title">
										{!n.read && <span className="note__dot" aria-hidden="true" />}
										{n.title}
									</div>
									<div className="note__text">{n.body}</div>
								</div>
								<div className="note__right">
									<span className="note__time">{timeAgo(n.createdAt)}</span>
									{cta && (
										<Link
											href={cta.href}
											as={cta.as}
											className="note__link"
											onClick={(e) => e.stopPropagation()}
										>
											{cta.label}
										</Link>
									)}
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
};

NotificationsPage.getInitialProps = async (context, client, currentUser) => {
	if (!currentUser) {
		redirect(context, '/auth/signin');
		return { notifications: [] };
	}

	try {
		const { data } = await client.get('/api/notifications');
		return { notifications: data.notifications };
	} catch (err) {
		if (err.response?.status === 401) {
			redirect(context, '/auth/signin');
		}
		return { notifications: [] };
	}
};

export default NotificationsPage;
