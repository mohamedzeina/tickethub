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
import { QRCodeSVG } from 'qrcode.react';
import {
	formatPrice,
	formatDateShort,
	serialFromId,
} from '../../utils/ticket';
import SellerReview from '../../components/SellerReview';
import usePass from '../../hooks/usePass';
import redirect from '../../utils/redirect';

// A single seat's pass card — QR + copy when issued, or a used/void state. Each
// seat of a multi-seat order (#10) is scanned independently, so each gets its own.
const PassCard = ({ pass, multi }) => {
	const [copied, setCopied] = useState(false);

	const copyCode = async () => {
		try {
			await navigator.clipboard.writeText(pass.code);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			/* clipboard blocked — the QR still works */
		}
	};

	let inner;
	if (pass.status === 'issued' && pass.code) {
		inner = (
			<>
				<div className="pass__qr">
					<QRCodeSVG
						value={`${
							typeof window !== 'undefined' ? window.location.origin : ''
						}/gate?code=${encodeURIComponent(pass.code)}`}
						size={172}
						bgColor="#f3ecd8"
						fgColor="#211b16"
						level="M"
					/>
				</div>
				<div className="pass__hint">Scan at the gate. Single use.</div>
				<button type="button" className="btn pass__copy" onClick={copyCode}>
					{copied ? 'Copied ✓' : 'Copy gate code'}
				</button>
			</>
		);
	} else if (pass.status === 'redeemed') {
		inner = (
			<div className="pass__state pass__state--used">
				✓ Checked in
				{pass.redeemedAt ? ` · ${new Date(pass.redeemedAt).toLocaleString()}` : ''}
			</div>
		);
	} else if (pass.status === 'revoked') {
		inner = (
			<div className="pass__state pass__state--void">
				Pass revoked — this order was refunded.
			</div>
		);
	}

	return (
		<div className="pass__card">
			{multi && <div className="pass__seat">Seat {pass.seat}</div>}
			{inner}
		</div>
	);
};

// The admission passes (#delivery / #10) — one QR per seat the buyer shows at the
// gate. Minted off payment:created, so they can briefly lag; usePass polls while
// pending.
const AdmissionPass = ({ orderId }) => {
	const { passes, status } = usePass(orderId);
	const multi = passes.length > 1;

	let body;
	if (status === 'ready' && passes.length > 0) {
		body = (
			<div className={`pass__grid${multi ? ' pass__grid--multi' : ''}`}>
				{passes.map((p) => (
					<PassCard key={p.id} pass={p} multi={multi} />
				))}
			</div>
		);
	} else if (status === 'error') {
		body = <div className="pass__hint">Couldn’t load your pass.</div>;
	} else {
		// loading / pending — skeleton of the QR card so the slot doesn't sit
		// empty while the pass is minted (it can lag the paid order by a moment).
		body = (
			<>
				<div className="pass__qr sk" style={{ width: 172, height: 172 }} />
				<div className="pass__hint">Generating your pass…</div>
			</>
		);
	}

	return (
		<div className="pass">
			<div className="pass__head">
				{multi ? `Admission Passes · ${passes.length} seats` : 'Admission Pass'}
			</div>
			{body}
		</div>
	);
};

// Formats the refund deadline as e.g. "Jun 6, 2026 · 2:48 AM" for the receipt.
const formatDeadline = (value) => {
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

// Buyer-initiated refund (#6 tail). The receipt shows one of three states:
//   • refundable           → a two-step "Request refund" control
//   • refundRequestedAt set → "Refund processing" (Stripe webhook hasn't
//                             confirmed yet); poll until the order flips
//   • neither               → nothing (window passed, redeemed, etc.)
// The actual Refunded status lands asynchronously once payments confirms the
// Stripe `charge.refunded` webhook, so after requesting we poll the order and
// reload into the refunded dead-end when it settles.
const RefundControl = ({ order }) => {
	// Multi-seat (#10): the refund returns the whole order (per-seat price × seats).
	const total = order.ticket.price * (order.quantity ?? 1);
	const [requested, setRequested] = useState(!!order.refundRequestedAt);
	const [confirming, setConfirming] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);

	// The deadline is a wall-clock time; format after mount to avoid an
	// SSR/client hydration mismatch (same reasoning as "Paid on").
	const [deadline, setDeadline] = useState(null);
	useEffect(() => {
		setDeadline(formatDeadline(order.refundableUntil));
	}, [order.refundableUntil]);

	// While a refund is processing, watch for the webhook to flip the order to
	// refunded (or cancelled) and reload into the refunded dead-end.
	useEffect(() => {
		if (!requested) return undefined;
		let active = true;
		const id = setInterval(async () => {
			try {
				const { data } = await axios.get(`/api/orders/${order.id}`);
				if (
					active &&
					(data.status === 'refunded' || data.status === 'cancelled')
				) {
					clearInterval(id);
					Router.reload();
				}
			} catch (err) {
				/* transient — keep polling */
			}
		}, 2500);
		return () => {
			active = false;
			clearInterval(id);
		};
	}, [requested, order.id]);

	const requestRefund = async () => {
		setLoading(true);
		setError(null);
		try {
			await axios.post(`/api/orders/${order.id}/refund`);
			setRequested(true);
			setConfirming(false);
		} catch (err) {
			setError(
				err?.response?.data?.errors?.[0]?.message ||
					'Could not request a refund. Please try again.',
			);
		} finally {
			setLoading(false);
		}
	};

	if (requested) {
		return (
			<div className="refund refund--processing">
				<div className="refund__spinner" aria-hidden="true" />
				<div className="refund__head">Refund processing</div>
				<p className="refund__note">
					We&apos;re returning {formatPrice(total)} to your
					original payment method and releasing the ticket. This takes a few
					seconds to confirm; it can take 5–10 business days to appear on your
					statement.
				</p>
			</div>
		);
	}

	if (!order.refundable) return null;

	return (
		<div className="refund">
			{confirming ? (
				<>
					<div className="refund__head">Refund this order?</div>
					<p className="refund__note">
						This releases your ticket back for sale and returns{' '}
						{formatPrice(total)} to your original payment method.
						This can&apos;t be undone.
					</p>
					{error && <div className="card-error">{error}</div>}
					<div className="refund__actions">
						<button
							type="button"
							className="btn btn--red"
							onClick={requestRefund}
							disabled={loading}
						>
							{loading ? 'Requesting…' : 'Confirm refund'}
						</button>
						<button
							type="button"
							className="btn btn--line"
							onClick={() => setConfirming(false)}
							disabled={loading}
						>
							Keep ticket
						</button>
					</div>
				</>
			) : (
				<>
					<button
						type="button"
						className="btn btn--line btn--block"
						onClick={() => setConfirming(true)}
					>
						Request refund
					</button>
					{deadline && (
						<div className="refund__deadline">
							Refundable until {deadline}
						</div>
					)}
				</>
			)}
		</div>
	);
};

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
const Receipt = ({ order, reviewState }) => {
	const eventDate = formatDateShort(order.ticket.eventDate);
	const meta = [eventDate, order.ticket.venue].filter(Boolean).join(' · ');
	// Multi-seat (#10): amount paid is the per-seat price times the seats bought.
	const seats = order.quantity ?? 1;
	const total = order.ticket.price * seats;
	// "Paid on" carries a wall-clock time, which differs between the server (pod
	// TZ) and the browser (the buyer's TZ) — formatting it during SSR causes a
	// hydration mismatch. Format it after mount so it shows the buyer's local
	// time with no server/client clash.
	const [paidAt, setPaidAt] = useState(null);
	useEffect(() => {
		setPaidAt(formatPaidAt(order.paidAt));
	}, [order.paidAt]);

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
						{seats > 1 && (
							<div className="receipt__row">
								<dt>Seats</dt>
								<dd>{seats} × {formatPrice(order.ticket.price)}</dd>
							</div>
						)}
						<div className="receipt__row">
							<dt>Amount paid</dt>
							<dd>{formatPrice(total)}</dd>
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

					<AdmissionPass orderId={order.id} />

					<RefundControl order={order} />

					<SellerReview orderId={order.id} initialState={reviewState} />

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

const OrderShow = ({ order, reviewState }) => {
	const [timeLeft, setTimeLeft] = useState(0);

	useEffect(() => {
		if (!order) return;
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

	// The order couldn't be loaded (missing, not yours, or a transient outage).
	// Render a calm dead-end instead of throwing — a thrown getInitialProps
	// would cancel the route transition and bounce the user back.
	if (!order) {
		return (
			<div className="container">
				<div className="gate stocked bordered">
					<div className="gate--expired">
						<span className="stamp stamp--void" style={{ marginBottom: 18 }}>
							Void
						</span>
						<div className="big">Order unavailable</div>
						<p>
							We couldn&apos;t pull up this order. It may have been removed, or
							it isn&apos;t one of yours. Check your orders for the full list.
						</p>
						<Link href="/orders" className="btn btn--red" style={{ marginTop: 22 }}>
							My orders
						</Link>
					</div>
				</div>
			</div>
		);
	}

	// A paid order shows its receipt, not the checkout gate.
	if (order.status === 'complete') {
		return <Receipt order={order} reviewState={reviewState} />;
	}

	// A cancelled order — an abandoned hold, or a refunded purchase — is a
	// dead-end, never the checkout gate. A paidAt means it was a real purchase
	// that got refunded (the ticket has already been released back to sale).
	if (order.status === 'cancelled' || order.status === 'refunded') {
		const wasPaid = !!order.paidAt;
		return (
			<div className="container">
				<div className="gate stocked bordered">
					<div className="gate--expired">
						<span className="stamp stamp--void" style={{ marginBottom: 18 }}>
							Void
						</span>
						<div className="big">{wasPaid ? 'Order refunded' : 'Order cancelled'}</div>
						<p>
							{wasPaid
								? 'This order was refunded and the ticket released. Your refund is on its way to your original payment method — it can take 5–10 business days to appear on your statement.'
								: 'This reservation was cancelled and the ticket released. Head back and pick up another.'}
						</p>
						<Link href="/" className="btn btn--red" style={{ marginTop: 22 }}>
							Browse tickets
						</Link>
					</div>
				</div>
			</div>
		);
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
	// Multi-seat (#10): the buyer pays the per-seat price for every reserved seat.
	const seats = order.quantity ?? 1;
	const total = order.ticket.price * seats;

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
						<span className="l">
							Total Due
							{seats > 1 && (
								<small className="gate__seats">
									{seats} × {formatPrice(order.ticket.price)}
								</small>
							)}
						</span>
						<span className="a">{formatPrice(total)}</span>
					</div>
				</div>

				<div className="perf">
					<span className="notch notch--l" />
					<span className="notch notch--r" />
				</div>

				<div className="gate__pay">
					<Elements stripe={stripePromise}>
						<CheckoutForm amount={total} orderId={order.id} />
					</Elements>
				</div>
			</div>
		</div>
	);
};

OrderShow.getInitialProps = async (context, client, currentUser) => {
	const { orderId } = context.query;

	// This runs as part of a client-side route transition. If it throws, Next
	// cancels the transition and bounces you back to the page you came from
	// (while the URL bar already shows this one). So never throw: an expired
	// session redirects to sign in, anything else renders the "unavailable"
	// state below.
	if (!currentUser) {
		redirect(context, '/auth/signin');
		return { order: null };
	}

	let data;
	try {
		({ data } = await client.get(`/api/orders/${orderId}`));
	} catch (err) {
		if (err.response?.status === 401) {
			redirect(context, '/auth/signin');
		}
		return { order: null };
	}

	// For a completed order, fetch the seller-review state up front so the review
	// block is present on first paint instead of popping in after a client-side
	// fetch. Best-effort: a reviews hiccup just falls back to the client fetch.
	let reviewState = null;
	if (data.status === 'complete') {
		try {
			const r = await client.get(`/api/reviews/order/${orderId}`);
			reviewState = r.data;
		} catch (err) {
			/* reviews unavailable → SellerReview will fetch client-side */
		}
	}

	return { order: data, reviewState };
};

export default OrderShow;
