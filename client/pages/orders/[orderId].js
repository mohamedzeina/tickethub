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
import { formatPrice, formatDateShort } from '../../utils/ticket';

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

// Embedded card form: tokenizes the card client-side, then hands the token to
// the parent so it can hit /api/payments (which charges via the token source).
const CheckoutForm = ({ amount, onToken }) => {
	const stripe = useStripe();
	const elements = useElements();
	const [loading, setLoading] = useState(false);
	const [focused, setFocused] = useState(false);
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
				{loading ? 'Processing…' : `Validate & Pay ${formatPrice(amount)}`}
			</button>

			<p className="test-note">
				Test card · 4242 4242 4242 4242 · any future date · any CVC
			</p>
		</div>
	);
};

const OrderShow = ({ order }) => {
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
						<CheckoutForm
							amount={order.ticket.price}
							onToken={(token) => doRequest({ token })}
						/>
					</Elements>
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
