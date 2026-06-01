import { useState } from 'react';
import Link from 'next/link';
import Router from 'next/router';
import useRequest from '../../hooks/useRequest';

const formatPrice = (price) =>
	new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	}).format(Number(price) || 0);

const TicketShow = ({ ticket }) => {
	const [loading, setLoading] = useState(false);

	const { doRequest, generalErrors } = useRequest({
		url: '/api/orders',
		method: 'post',
		body: { ticketId: ticket.id },
		onSuccess: (order) =>
			Router.push('/orders/[orderId]', `/orders/${order.id}`),
	});

	const onPurchase = async () => {
		setLoading(true);
		await doRequest();
		setLoading(false);
	};

	return (
		<div className="mx-auto mt-4 w-full max-w-2xl">
			<Link
				href="/"
				className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 transition-colors duration-200 hover:text-brand-900"
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth={2}
					strokeLinecap="round"
					strokeLinejoin="round"
					className="h-4 w-4"
					aria-hidden="true"
				>
					<path d="M19 12H5M11 18l-6-6 6-6" />
				</svg>
				Back to tickets
			</Link>

			<div className="mt-5 overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm">
				{/* Ticket header strip */}
				<div className="bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 px-6 py-8 text-white sm:px-8">
					<span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide">
						Event ticket
					</span>
					<h1 className="mt-3 font-display text-3xl font-extrabold leading-tight">
						{ticket.title}
					</h1>
				</div>

				<div className="px-6 py-6 sm:px-8">
					<div className="flex items-end justify-between">
						<div>
							<div className="text-sm font-medium text-ink-soft">Price</div>
							<div className="text-3xl font-bold text-brand-700">
								{formatPrice(ticket.price)}
							</div>
						</div>
						<div className="text-xs font-medium text-ink-soft">per ticket</div>
					</div>

					<button
						onClick={onPurchase}
						disabled={loading}
						className="mt-6 w-full cursor-pointer rounded-lg bg-accent-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-accent-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{loading ? 'Reserving…' : 'Purchase'}
					</button>

					<p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-soft">
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth={2}
							strokeLinecap="round"
							strokeLinejoin="round"
							className="h-4 w-4 text-accent-600"
							aria-hidden="true"
						>
							<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
						</svg>
						Secure checkout — your order is held for 15 minutes.
					</p>

					{generalErrors()}
				</div>
			</div>
		</div>
	);
};

TicketShow.getInitialProps = async (context, client) => {
	const { ticketId } = context.query;
	const { data } = await client.get(`/api/tickets/${ticketId}`);

	return { ticket: data };
};

export default TicketShow;
