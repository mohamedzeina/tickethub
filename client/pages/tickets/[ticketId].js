import { useState } from 'react';
import Link from 'next/link';
import Router from 'next/router';
import useRequest from '../../hooks/useRequest';

const formatPrice = (price) =>
	new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	}).format(Number(price) || 0);

const formatDate = (value) =>
	value
		? new Intl.DateTimeFormat('en-US', {
				weekday: 'short',
				month: 'long',
				day: 'numeric',
				year: 'numeric',
		  }).format(new Date(value))
		: null;

const CalendarIcon = (props) => (
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth={1.8}
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
		{...props}
	>
		<rect x="3" y="4" width="18" height="18" rx="2" />
		<path d="M16 2v4M8 2v4M3 10h18" />
	</svg>
);

const LocationIcon = (props) => (
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth={1.8}
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
		{...props}
	>
		<path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
		<circle cx="12" cy="10" r="2.5" />
	</svg>
);

const TicketShow = ({ ticket }) => {
	const [loading, setLoading] = useState(false);
	const date = formatDate(ticket.eventDate);

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
				{/* Header — image with overlay if provided, else gradient strip */}
				{ticket.imageUrl ? (
					<div className="relative h-60 w-full sm:h-72">
						<img
							src={ticket.imageUrl}
							alt={ticket.title}
							className="h-full w-full object-cover"
						/>
						<div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
						<div className="absolute bottom-0 left-0 right-0 px-6 py-6 text-white sm:px-8">
							<span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide backdrop-blur">
								{ticket.category || 'Event ticket'}
							</span>
							<h1 className="mt-3 font-display text-3xl font-extrabold leading-tight drop-shadow">
								{ticket.title}
							</h1>
						</div>
					</div>
				) : (
					<div className="bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 px-6 py-8 text-white sm:px-8">
						<span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide">
							{ticket.category || 'Event ticket'}
						</span>
						<h1 className="mt-3 font-display text-3xl font-extrabold leading-tight">
							{ticket.title}
						</h1>
					</div>
				)}

				<div className="px-6 py-6 sm:px-8">
					{/* Event details */}
					<div className="space-y-2.5 text-sm text-ink">
						{date && (
							<div className="flex items-center gap-2.5">
								<CalendarIcon className="h-5 w-5 shrink-0 text-brand-500" />
								<span className="font-medium">{date}</span>
							</div>
						)}
						{ticket.venue && (
							<div className="flex items-center gap-2.5">
								<LocationIcon className="h-5 w-5 shrink-0 text-brand-500" />
								<span className="font-medium">{ticket.venue}</span>
							</div>
						)}
					</div>

					{ticket.description && (
						<p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
							{ticket.description}
						</p>
					)}

					<div className="mt-6 flex items-end justify-between border-t border-brand-100 pt-6">
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
