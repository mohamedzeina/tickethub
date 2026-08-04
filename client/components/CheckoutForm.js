import { useState } from 'react';
import axios from 'axios';
import Router from 'next/router';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { formatPrice } from '../utils/ticket';
import { apiError } from '../utils/apiError';

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
	const [cardComplete, setCardComplete] = useState(false);

	const handlePay = async () => {
		if (!stripe || !elements) return;

		// Guard incomplete card details up front with a clear message, rather than
		// letting the attempt fail and surface a vague "something went wrong".
		if (!cardComplete) {
			setCardError('Please enter your full card details.');
			return;
		}

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
			const message = apiError(err, 'Something went wrong. Please try again.');
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
					onChange={(e) => {
						setCardError(e.error ? e.error.message : null);
						setCardComplete(e.complete);
					}}
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

export default CheckoutForm;
