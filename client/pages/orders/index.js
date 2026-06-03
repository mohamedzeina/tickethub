import Link from 'next/link';
import { formatPrice, formatDateShort, serialFromId } from '../../utils/ticket';
import redirect from '../../utils/redirect';

// Map an order status to an admission-stamp style + label.
const stampFor = (status) => {
	switch (status) {
		case 'complete':
			return { cls: 'stamp--paid', label: 'Paid' };
		case 'cancelled':
			return { cls: 'stamp--void', label: 'Void' };
		default:
			return { cls: 'stamp--pending', label: 'Pending' };
	}
};

const payable = (status) =>
	status === 'created' || status === 'awaiting:payment';

const OrderRow = ({ order }) => {
	const date = formatDateShort(order.ticket.eventDate);
	const meta = [date, order.ticket.venue].filter(Boolean).join(' · ');
	const stamp = stampFor(order.status);

	return (
		<li className="ord stocked bordered">
			<div className="ord__qr">
				<div className="qr" aria-hidden="true" />
			</div>

			<div>
				<div className="ord__title">{order.ticket.title}</div>
				{meta && <div className="ord__meta">{meta.toUpperCase()}</div>}
				<div className="ord__price">
					{formatPrice(order.ticket.price)} · No. {serialFromId(order.id)}
				</div>
				{order.status === 'complete' && order.paidAt && (
					<div className="ord__paid">Paid {formatDateShort(order.paidAt)}</div>
				)}
			</div>

			<div className="ord__right">
				<span className={`stamp ${stamp.cls}`}>{stamp.label}</span>
				{payable(order.status) && (
					<Link
						href="/orders/[orderId]"
						as={`/orders/${order.id}`}
						className="btn btn--red"
					>
						Pay now
					</Link>
				)}
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
