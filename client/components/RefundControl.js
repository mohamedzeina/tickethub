import { useEffect, useState } from 'react';
import axios from 'axios';
import Router from 'next/router';
import { formatPrice, formatDateTime } from '../utils/ticket';
import { apiError } from '../utils/apiError';

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
		setDeadline(formatDateTime(order.refundableUntil));
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
			setError(apiError(err, 'Could not request a refund. Please try again.'));
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

export default RefundControl;
