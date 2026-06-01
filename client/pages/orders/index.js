import Link from 'next/link';

const formatPrice = (price) =>
	new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	}).format(Number(price) || 0);

const formatDate = (value) =>
	value
		? new Intl.DateTimeFormat('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
		  }).format(new Date(value))
		: null;

// Map an order status to a pill style + readable label.
const statusStyles = {
	complete: 'bg-accent-100 text-accent-700',
	created: 'bg-amber-100 text-amber-700',
	'awaiting:payment': 'bg-amber-100 text-amber-700',
	cancelled: 'bg-red-100 text-red-700',
};

const prettyStatus = (status) =>
	status.replace(':', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const payable = (status) => status === 'created' || status === 'awaiting:payment';

const OrderRow = ({ order }) => {
	const date = formatDate(order.ticket.eventDate);
	const meta = [date, order.ticket.venue].filter(Boolean).join(' · ');

	const pill = (
		<span
			className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
				statusStyles[order.status] || 'bg-brand-100 text-brand-700'
			}`}
		>
			{prettyStatus(order.status)}
		</span>
	);

	return (
		<li className="flex items-center justify-between gap-4 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
			<div className="min-w-0">
				<h3 className="truncate font-display text-base font-semibold text-ink">
					{order.ticket.title}
				</h3>
				{meta && (
					<div className="mt-0.5 truncate text-xs text-ink-soft">{meta}</div>
				)}
				<div className="mt-1 text-sm font-medium text-brand-700">
					{formatPrice(order.ticket.price)}
				</div>
			</div>

			<div className="flex items-center gap-3">
				{pill}
				{payable(order.status) && (
					<Link
						href="/orders/[orderId]"
						as={`/orders/${order.id}`}
						className="cursor-pointer rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-accent-600"
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
		<div>
			<div className="mb-6">
				<h1 className="font-display text-2xl font-bold text-ink">My orders</h1>
				<p className="mt-1 text-sm text-ink-soft">
					{orders.length} {orders.length === 1 ? 'order' : 'orders'} total
				</p>
			</div>

			{orders.length === 0 ? (
				<div className="rounded-2xl border border-dashed border-brand-200 bg-white/60 px-6 py-16 text-center">
					<h3 className="font-display text-lg font-semibold text-ink">
						No orders yet
					</h3>
					<p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
						Browse the marketplace and grab tickets to your next event.
					</p>
					<Link
						href="/"
						className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-brand-700"
					>
						Browse tickets
					</Link>
				</div>
			) : (
				<ul className="space-y-4">
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
