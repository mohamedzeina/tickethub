import Link from 'next/link';
import { formatPrice, formatDateShort, serialFromId } from '../../utils/ticket';

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
			</div>
		</li>
	);
};

const OrderIndex = ({ orders }) => {
	return (
		<div className="container container--mid">
			<div className="sec-head" style={{ marginTop: 0 }}>
				<h2>My Tickets</h2>
				<div className="count">
					{orders.length} {orders.length === 1 ? 'Issued' : 'Issued'}
				</div>
			</div>

			{orders.length === 0 ? (
				<div className="empty stocked bordered">
					<h3>No tickets in hand</h3>
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

OrderIndex.getInitialProps = async (context, client) => {
	const { data } = await client.get('/api/orders');

	return { orders: data };
};

export default OrderIndex;
