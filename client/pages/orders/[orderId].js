import { useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { loadStripe } from '@stripe/stripe-js';
import {
	Elements,
	CardElement,
	useStripe,
	useElements,
} from '@stripe/react-stripe-js';
import Router from 'next/router';
import {
	formatPrice,
	formatDateShort,
	serialFromId,
} from '../../utils/ticket';
import SellerReview from '../../components/SellerReview';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY);

const formatClock = (totalSeconds) => {
	const m = Math.floor(totalSeconds / 60);
	const s = totalSeconds % 60;
	return `${m}:${String(s).padStart(2, '0')}`;
};

// Styling for the embedded Stripe card field so it matches the ink-on-stock theme.
const cardElementOptions = {
	style: {
		base: {
			color: '#211b14',
			fontFamily: '"DM Mono", ui-monospace, monospace',
			fontSize: '15px',
			fontSmoothing: 'antialiased',
			'::placeholder': { color: '#6f6244' },
		},
		invalid: { color: '#c4291b', iconColor: '#c4291b' },
	},
};

// Embedded card form. C3: the server creates a PaymentIntent and returns its
// client_secret; the browser confirms the card directly with Stripe. The order
// is marked paid by the webhook (payment_intent.succeeded), not by this request.
// The card succeeds at Stripe, but the order is only marked `complete` once the
// webhook (payment_intent.succeeded) reaches payments → publishes payment:created
// → the orders listener flips it. That's eventually consistent (~1–2s). Poll the
// order until it reflects the payment so the buyer doesn't land back on a stale
// "Pay now" list. Capped so a missed webhook still redirects rather than hangs.
const waitForCompletion = async (orderId, { attempts = 20, intervalMs = 600 } = {}) => {
	for (let i = 0; i < attempts; i++) {
		try {
			const { data } = await axios.get(`/api/orders/${orderId}`);
			if (data.status === 'complete') return true;
		} catch (err) {
			// transient — keep polling
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	return false;
};

const CheckoutForm = ({ amount, orderId }) => {
	const stripe = useStripe();
	const elements = useElements();
	const [loading, setLoading] = useState(false);
	const [finalizing, setFinalizing] = useState(false);
	const [focused, setFocused] = useState(false);
	const [cardError, setCardError] = useState(null);

	const handlePay = async () => {
		if (!stripe || !elements) return;

		setLoading(true);
		setCardError(null);

		try {
			// 1. ask the server to create a PaymentIntent for this order
			const { data } = await axios.post('/api/payments', { orderId });

			// 2. confirm the card against that intent, client-side
			const result = await stripe.confirmCardPayment(data.clientSecret, {
				payment_method: { card: elements.getElement(CardElement) },
			});

			if (result.error) {
				setCardError(result.error.message);
				setLoading(false);
				return;
			}

			if (result.paymentIntent?.status === 'succeeded') {
				// 3. wait for the order to actually reflect the payment before
				// sending the buyer back to their (otherwise stale) orders list.
				setFinalizing(true);
				await waitForCompletion(orderId);
				Router.push('/orders');
				return;
			}

			setCardError('Payment could not be completed. Please try again.');
			setLoading(false);
		} catch (err) {
			const message =
				err?.response?.data?.errors?.[0]?.message ||
				'Something went wrong. Please try again.';
			setCardError(message);
			setLoading(false);
			setFinalizing(false);
		}
	};

	return (
		<div>
			<label>Card details</label>
			<div className={`stripe-field${focused ? ' is-focused' : ''}`}>
				<CardElement
					options={cardElementOptions}
					onFocus={() => setFocused(true)}
					onBlur={() => setFocused(false)}
					onChange={(e) => setCardError(e.error ? e.error.message : null)}
				/>
			</div>
			{cardError && <div className="card-error">{cardError}</div>}

			<button
				onClick={handlePay}
				disabled={!stripe || loading}
				className="btn btn--red btn--block"
				style={{ marginTop: 16 }}
			>
				{finalizing
					? 'Finalizing payment…'
					: loading
						? 'Processing…'
						: `Validate & Pay ${formatPrice(amount)}`}
			</button>

			<p className="test-note">
				Test card · 4242 4242 4242 4242 · any future date · any CVC
			</p>
		</div>
	);
};

// Formats the paid-at timestamp as e.g. "Jun 3, 2026 · 2:48 AM".
const formatPaidAt = (value) => {
	if (!value) return null;
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return null;
	const date = d.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
	const time = d.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
	});
	return `${date} · ${time}`;
};

// C5: a real receipt for a paid order — replaces the checkout gate once the
// webhook-driven payment:created event has completed the order.
const Receipt = ({ order }) => {
	const eventDate = formatDateShort(order.ticket.eventDate);
	const meta = [eventDate, order.ticket.venue].filter(Boolean).join(' · ');
	const paidAt = formatPaidAt(order.paidAt);

	return (
		<div className="container">
			<div className="gate stocked bordered">
				<div className="gate__head">
					<span className="stamp stamp--paid" style={{ marginBottom: 14 }}>
						Paid
					</span>
					<h2>{order.ticket.title}</h2>
					{meta && <p>{meta}</p>}
				</div>

				<div className="perf">
					<span className="notch notch--l" />
					<span className="notch notch--r" />
				</div>

				<div className="gate__pay">
					<dl className="receipt">
						<div className="receipt__row">
							<dt>Amount paid</dt>
							<dd>{formatPrice(order.ticket.price)}</dd>
						</div>
						{paidAt && (
							<div className="receipt__row">
								<dt>Paid on</dt>
								<dd>{paidAt}</dd>
							</div>
						)}
						<div className="receipt__row">
							<dt>Order no.</dt>
							<dd>{serialFromId(order.id)}</dd>
						</div>
						{order.stripeId && (
							<div className="receipt__row">
								<dt>Stripe ref</dt>
								<dd className="receipt__ref">{order.stripeId}</dd>
							</div>
						)}
					</dl>

					<SellerReview orderId={order.id} />

					<Link
						href="/orders"
						className="btn btn--red btn--block"
						style={{ marginTop: 18 }}
					>
						Back to my orders
					</Link>
				</div>
			</div>
		</div>
	);
};

const OrderShow = ({ order }) => {
	const [timeLeft, setTimeLeft] = useState(0);

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

	// A paid order shows its receipt, not the checkout gate.
	if (order.status === 'complete') {
		return <Receipt order={order} />;
	}

	if (timeLeft < 0) {
		return (
			<div className="container">
				<div className="gate stocked bordered">
					<div className="gate--expired">
						<span className="stamp stamp--void" style={{ marginBottom: 18 }}>
							Void
						</span>
						<div className="big">Order expired</div>
						<p>
							This reservation timed out at the gate. Head back and pick up
							another ticket.
						</p>
						<Link href="/" className="btn btn--red" style={{ marginTop: 22 }}>
							Browse tickets
						</Link>
					</div>
				</div>
			</div>
		);
	}

	const urgent = timeLeft <= 60;
	const eventDate = formatDateShort(order.ticket.eventDate);
	const meta = [eventDate, order.ticket.venue].filter(Boolean).join(' · ');

	return (
		<div className="container">
			<div className="gate stocked bordered">
				<div className="gate__head">
					<div className="lab">Validate to enter</div>
					<h2>{order.ticket.title}</h2>
					{meta && <p>{meta}</p>}
				</div>

				<div className="gate__count">
					<div className="k">Gate closes in</div>
					<div className={`clock${urgent ? ' urgent' : ''}`}>
						{formatClock(timeLeft)}
					</div>
					<div className="gate__total">
						<span className="l">Total Due</span>
						<span className="a">{formatPrice(order.ticket.price)}</span>
					</div>
				</div>

				<div className="perf">
					<span className="notch notch--l" />
					<span className="notch notch--r" />
				</div>

				<div className="gate__pay">
					<Elements stripe={stripePromise}>
						<CheckoutForm amount={order.ticket.price} orderId={order.id} />
					</Elements>
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
