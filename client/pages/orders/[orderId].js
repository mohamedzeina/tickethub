import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';
import {
	Elements,
	CardElement,
	useStripe,
	useElements,
} from '@stripe/react-stripe-js';
import useRequest from '../../hooks/useRequest';
import Router from 'next/router';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY);

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

const formatClock = (totalSeconds) => {
	const m = Math.floor(totalSeconds / 60);
	const s = totalSeconds % 60;
	return `${m}:${String(s).padStart(2, '0')}`;
};

// Styling for the embedded Stripe card field so it matches the TicketHub theme.
const cardElementOptions = {
	style: {
		base: {
			color: '#4c1d95',
			fontFamily: '"Nunito Sans", ui-sans-serif, system-ui, sans-serif',
			fontSize: '16px',
			fontSmoothing: 'antialiased',
			'::placeholder': { color: '#9b8bbf' },
		},
		invalid: { color: '#dc2626', iconColor: '#dc2626' },
	},
};

// Embedded card form: tokenizes the card client-side, then hands the token to
// the parent so it can hit /api/payments (which charges via the token source).
const CheckoutForm = ({ amount, onToken }) => {
	const stripe = useStripe();
	const elements = useElements();
	const [loading, setLoading] = useState(false);
	const [cardError, setCardError] = useState(null);

	const handlePay = async () => {
		if (!stripe || !elements) return;

		setLoading(true);
		setCardError(null);

		const { token, error } = await stripe.createToken(
			elements.getElement(CardElement),
		);

		if (error) {
			setCardError(error.message);
			setLoading(false);
			return;
		}

		await onToken(token.id);
		setLoading(false);
	};

	return (
		<div>
			<label className="mb-1.5 block text-left text-sm font-semibold text-ink">
				Card details
			</label>
			<div className="rounded-lg border border-brand-200 bg-white px-3.5 py-3.5 shadow-sm transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200">
				<CardElement
					options={cardElementOptions}
					onChange={(e) => setCardError(e.error ? e.error.message : null)}
				/>
			</div>
			{cardError && (
				<div className="mt-1.5 text-left text-sm font-medium text-red-600">
					{cardError}
				</div>
			)}

			<button
				onClick={handlePay}
				disabled={!stripe || loading}
				className="mt-5 w-full cursor-pointer rounded-lg bg-accent-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-accent-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{loading ? 'Processing…' : `Pay ${formatPrice(amount)}`}
			</button>

			<p className="mt-3 text-center text-xs text-ink-soft">
				Test card: 4242 4242 4242 4242 · any future date · any CVC
			</p>
		</div>
	);
};

const OrderShow = ({ order, currentUser }) => {
	const [timeLeft, setTimeLeft] = useState(0);
	const { doRequest, generalErrors } = useRequest({
		url: '/api/payments',
		method: 'post',
		body: { orderId: order.id },
		onSuccess: () => Router.push('/orders'),
	});

	useEffect(() => {
		const findTimeLeft = () => {
			const msLeft = new Date(order.expiresAt) - new Date();
			setTimeLeft(Math.round(msLeft / 1000));
		};

		findTimeLeft();
		const timerId = setInterval(findTimeLeft, 1000);

		return () => {
			clearInterval(timerId);
		};
	}, [order]);

	if (timeLeft < 0) {
		return (
			<div className="mx-auto mt-10 w-full max-w-md">
				<div className="rounded-2xl border border-red-200 bg-white p-10 text-center shadow-sm">
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth={2}
							strokeLinecap="round"
							strokeLinejoin="round"
							className="h-6 w-6"
							aria-hidden="true"
						>
							<circle cx="12" cy="12" r="9" />
							<path d="M12 7v5M12 16h.01" />
						</svg>
					</div>
					<h1 className="mt-5 font-display text-xl font-bold text-ink">
						Order expired
					</h1>
					<p className="mt-1 text-sm text-ink-soft">
						This reservation timed out. You can head back and pick up another
						ticket.
					</p>
					<Link
						href="/"
						className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-brand-700"
					>
						Browse tickets
					</Link>
				</div>
			</div>
		);
	}

	const urgent = timeLeft <= 60;
	const eventDate = formatDate(order.ticket.eventDate);
	const meta = [eventDate, order.ticket.venue].filter(Boolean).join(' · ');

	return (
		<div className="mx-auto mt-6 w-full max-w-md">
			<div className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm">
				<div className="border-b border-brand-100 px-6 py-6 text-center">
					<h1 className="font-display text-xl font-bold text-ink">
						Complete your purchase
					</h1>
					<p className="mt-1 text-sm font-medium text-ink">
						{order.ticket.title}
					</p>
					{meta && (
						<p className="mt-0.5 text-xs text-ink-soft">{meta}</p>
					)}
				</div>

				<div className="px-6 py-7">
					{/* Countdown */}
					<div className="text-center">
						<div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
							Time left to pay
						</div>
						<div
							className={`mt-2 font-display text-5xl font-extrabold tabular-nums ${
								urgent ? 'text-red-600' : 'text-brand-700'
							}`}
						>
							{formatClock(timeLeft)}
						</div>

						<div className="mt-6 flex items-baseline justify-center gap-2">
							<span className="text-sm font-medium text-ink-soft">Total</span>
							<span className="text-2xl font-bold text-ink">
								{formatPrice(order.ticket.price)}
							</span>
						</div>
					</div>

					<div className="mt-7 border-t border-brand-100 pt-6">
						<Elements stripe={stripePromise}>
							<CheckoutForm
								amount={order.ticket.price}
								onToken={(token) => doRequest({ token })}
							/>
						</Elements>
					</div>

					{generalErrors()}
				</div>
			</div>
		</div>
	);
};

OrderShow.getInitialProps = async (context, client) => {
	const { orderId } = context.query;
	const { data } = await client.get(`/api/orders/${orderId}`);

	return { order: data };
};

export default OrderShow;
