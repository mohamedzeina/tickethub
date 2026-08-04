import { useState } from 'react';
import Link from 'next/link';
import Router from 'next/router';
import axios from 'axios';
import {
	formatPrice,
	formatDateShort,
	serialFromId,
	eventMeta,
} from '../../utils/ticket';
import { apiError } from '../../utils/apiError';
import redirect from '../../utils/redirect';

// Map an order status to an admission-stamp style + label.
const stampFor = (status) => {
	switch (status) {
		case 'complete':
			return { cls: 'stamp--paid', label: 'Paid' };
		case 'refunded':
			return { cls: 'stamp--muted', label: 'Refunded' };
		case 'cancelled':
			return { cls: 'stamp--void', label: 'Void' };
		default:
			return { cls: 'stamp--pending', label: 'Pending' };
	}
};

const payable = (status) =>
	status === 'created' || status === 'awaiting:payment';

// Actions for an unpaid hold: pay, or cancel to release the seats. Cancel is a
// two-step confirm so a stray click can't drop a hold. DELETE /api/orders/:id is
// idempotent and only touches unpaid orders (orders/src/routes/cancel.ts); it
// releases the held seats and publishes order:cancelled.
const PayableActions = ({ order }) => {
	const [confirming, setConfirming] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);

	const cancel = async () => {
		setLoading(true);
		setError(null);
		try {
			await axios.delete(`/api/orders/${order.id}`);
			Router.reload();
		} catch (err) {
			setError(apiError(err, 'Could not cancel this hold. Please try again.'));
			setLoading(false);
		}
	};

	if (confirming) {
		return (
			<div className="ord__confirm">
				<span className="ord__confirm-q">Release these seats?</span>
				<div className="ord__confirm-actions">
					<button
						type="button"
						className="btn btn--red"
						onClick={cancel}
						disabled={loading}
					>
						{loading ? 'Cancelling…' : 'Confirm cancel'}
					</button>
					<button
						type="button"
						className="btn btn--line"
						onClick={() => setConfirming(false)}
						disabled={loading}
					>
						Keep hold
					</button>
				</div>
				{error && <div className="card-error">{error}</div>}
			</div>
		);
	}

	return (
		<>
			<Link
				href="/orders/[orderId]"
				as={`/orders/${order.id}`}
				className="btn btn--red"
			>
				Pay now
			</Link>
			<button
				type="button"
				className="ord__cancelbtn"
				onClick={() => setConfirming(true)}
			>
				Cancel hold
			</button>
		</>
	);
};

const OrderRow = ({ order }) => {
	const date = formatDateShort(order.ticket.eventDate);
	const meta = eventMeta(date, order.ticket.venue);
	const stamp = stampFor(order.status);
	// Multi-seat (#10): the order total is the per-seat price times the seats.
	const seats = order.quantity ?? 1;
	const total = order.ticket.price * seats;

	return (
		<li className="ord stocked bordered">
			<div className="ord__qr">
				<div className="qr" aria-hidden="true" />
			</div>

			<div>
				<div className="ord__title">{order.ticket.title}</div>
				{meta && <div className="ord__meta">{meta.toUpperCase()}</div>}
				<div className="ord__price">
					{formatPrice(total)}
					{seats > 1 ? ` · ${seats} seats` : ''} · No. {serialFromId(order.id)}
				</div>
				{order.status === 'complete' && order.paidAt && (
					<div className="ord__paid">Paid {formatDateShort(order.paidAt)}</div>
				)}
				{order.status === 'complete' && order.refundRequestedAt && (
					<div className="ord__refunding">Refund processing</div>
				)}
			</div>

			<div className="ord__right">
				<span className={`stamp ${stamp.cls}`}>{stamp.label}</span>
				{payable(order.status) && <PayableActions order={order} />}
				{order.status === 'complete' && (
					<Link
						href="/orders/[orderId]"
						as={`/orders/${order.id}`}
						className="btn btn--line"
					>
						View receipt
					</Link>
				)}
			</div>
		</li>
	);
};

const OrderIndex = ({ orders }) => {
	return (
		<div className="container container--mid">
			<div className="sec-head" style={{ marginTop: 0 }}>
				<h2>My Orders</h2>
				<div className="count">
					{orders.length} {orders.length === 1 ? 'Order' : 'Orders'}
				</div>
			</div>

			{orders.length === 0 ? (
				<div className="empty stocked bordered">
					<h3>No orders yet</h3>
					<p>Browse what&apos;s on sale and grab seats to your next event.</p>
					<Link href="/" className="btn btn--red" style={{ marginTop: 22 }}>
						Browse tickets
					</Link>
				</div>
			) : (
				<ul className="orders">
					{orders.map((order) => (
						<OrderRow key={order.id} order={order} />
					))}
				</ul>
			)}
		</div>
	);
};

OrderIndex.getInitialProps = async (context, client, currentUser) => {
	// A signed-out (or expired) session used to throw a 401 here, which surfaced
	// as a 500 error page. Send those visitors to sign in instead; treat any
	// other fetch failure as an empty list rather than crashing the page.
	if (!currentUser) {
		redirect(context, '/auth/signin');
		return { orders: [] };
	}

	try {
		const { data } = await client.get('/api/orders');
		return { orders: data };
	} catch (err) {
		if (err.response?.status === 401) {
			redirect(context, '/auth/signin');
		}
		return { orders: [] };
	}
};

export default OrderIndex;
