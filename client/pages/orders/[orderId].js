import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import {
	formatPrice,
	formatDateShort,
	formatDateTime,
	serialFromId,
	eventMeta,
} from '../../utils/ticket';
import SellerReview from '../../components/SellerReview';
import AdmissionPass from '../../components/AdmissionPass';
import RefundControl from '../../components/RefundControl';
import CheckoutForm from '../../components/CheckoutForm';
import { ArrowLeft } from '../../components/icons';
import redirect from '../../utils/redirect';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY);

const formatClock = (totalSeconds) => {
	const m = Math.floor(totalSeconds / 60);
	const s = totalSeconds % 60;
	return `${m}:${String(s).padStart(2, '0')}`;
};

// C5: a real receipt for a paid order — replaces the checkout gate once the
// webhook-driven payment:created event has completed the order.
const Receipt = ({ order, reviewState }) => {
	const eventDate = formatDateShort(order.ticket.eventDate);
	const meta = eventMeta(eventDate, order.ticket.venue);
	// Multi-seat (#10): amount paid is the per-seat price times the seats bought.
	const seats = order.quantity ?? 1;
	const total = order.ticket.price * seats;
	// "Paid on" carries a wall-clock time, which differs between the server (pod
	// TZ) and the browser (the buyer's TZ) — formatting it during SSR causes a
	// hydration mismatch. Format it after mount so it shows the buyer's local
	// time with no server/client clash.
	const [paidAt, setPaidAt] = useState(null);
	useEffect(() => {
		setPaidAt(formatDateTime(order.paidAt));
	}, [order.paidAt]);

	return (
		<div className="container">
			<div className="receiptwrap">
				<Link href="/orders" className="backlink">
					<ArrowLeft /> Back to my orders
				</Link>

				<div className="gate gate--receipt stocked bordered">
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
					<div className="gate__cols">
						{/* Left: the receipt figures + refund */}
						<div className="gate__info">
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

							<RefundControl order={order} />
						</div>

						{/* Right: the admission passes — a detachable stub column */}
						<div className="gate__passcol">
							<AdmissionPass orderId={order.id} />
						</div>
					</div>

					{/* Full-width footer: seller review, so the top stays balanced */}
					<div className="gate__foot">
						<SellerReview orderId={order.id} initialState={reviewState} />
					</div>
				</div>
			</div>
			</div>
		</div>
	);
};

// The dead-ends an order can land on instead of the checkout gate — unavailable,
// cancelled/refunded, expired. Same voided ticket stub every time; only the
// heading, the explanation, and the way back differ.
const VoidGate = ({ heading, body, ctaHref, ctaLabel }) => (
	<div className="container">
		<div className="gate stocked bordered">
			<div className="gate--expired">
				<span className="stamp stamp--void" style={{ marginBottom: 18 }}>
					Void
				</span>
				<div className="big">{heading}</div>
				<p>{body}</p>
				<Link href={ctaHref} className="btn btn--red" style={{ marginTop: 22 }}>
					{ctaLabel}
				</Link>
			</div>
		</div>
	</div>
);

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
			<VoidGate
				heading="Order unavailable"
				body="We couldn&apos;t pull up this order. It may have been removed, or it isn&apos;t one of yours. Check your orders for the full list."
				ctaHref="/orders"
				ctaLabel="My orders"
			/>
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
			<VoidGate
				heading={wasPaid ? 'Order refunded' : 'Order cancelled'}
				body={
					wasPaid
						? 'This order was refunded and the ticket released. Your refund is on its way to your original payment method — it can take 5–10 business days to appear on your statement.'
						: 'This reservation was cancelled and the ticket released. Head back and pick up another.'
				}
				ctaHref="/"
				ctaLabel="Browse tickets"
			/>
		);
	}

	if (timeLeft < 0) {
		return (
			<VoidGate
				heading="Order expired"
				body="This reservation timed out at the gate. Head back and pick up another ticket."
				ctaHref="/"
				ctaLabel="Browse tickets"
			/>
		);
	}

	const urgent = timeLeft <= 60;
	const eventDate = formatDateShort(order.ticket.eventDate);
	const meta = eventMeta(eventDate, order.ticket.venue);
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
						<span className="l">Total Due</span>
						<span className="a">{formatPrice(total)}</span>
						{seats > 1 && (
							<span className="gate__seats">
								{seats} × {formatPrice(order.ticket.price)}
							</span>
						)}
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
