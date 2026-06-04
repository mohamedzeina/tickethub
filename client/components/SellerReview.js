import { useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { Star } from './icons';
import Stars from './Stars';

// Interactive 1–5 star picker with hover preview.
const StarPicker = ({ value, onChange }) => {
	const [hover, setHover] = useState(0);
	const shown = hover || value;
	return (
		<div className="starpick" onMouseLeave={() => setHover(0)}>
			{[1, 2, 3, 4, 5].map((i) => (
				<button
					key={i}
					type="button"
					className="starpick__btn"
					aria-label={`${i} star${i > 1 ? 's' : ''}`}
					onMouseEnter={() => setHover(i)}
					onClick={() => onChange(i)}
				>
					<Star filled={i <= shown} className="star" style={{ width: 26, height: 26 }} />
				</button>
			))}
		</div>
	);
};

// Seller-review block on the completed-order receipt (#9). Asks the reviews
// service whether this order is reviewable and whether the buyer has already
// left a review, then shows the existing review (with edit) or a submission
// form. Self-contained: all calls are client-side off the order id.
const SellerReview = ({ orderId, initialState = null }) => {
	// Seed from the SSR-provided state when available so the block is present on
	// first paint instead of popping in after a client fetch.
	const [state, setState] = useState(initialState); // { reviewable, sellerId, review }
	const [editing, setEditing] = useState(false);
	const [rating, setRating] = useState(initialState?.review?.rating || 0);
	const [comment, setComment] = useState(initialState?.review?.comment || '');
	const [error, setError] = useState(null);
	const [saving, setSaving] = useState(false);

	const load = () => {
		axios
			.get(`/api/reviews/order/${orderId}`)
			.then(({ data }) => {
				setState(data);
				if (data.review) {
					setRating(data.review.rating);
					setComment(data.review.comment || '');
				}
			})
			.catch(() => setState({ reviewable: false }));
	};

	// Only fetch on mount if we weren't handed SSR state (we still refresh after
	// a submit). Keyed on orderId so navigating between orders refetches.
	useEffect(() => {
		if (!initialState) load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [orderId]);

	const submit = async () => {
		if (!rating) {
			setError('Pick a star rating first.');
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const editingExisting = state.review && editing;
			if (editingExisting) {
				await axios.put(`/api/reviews/${state.review.id}`, { rating, comment });
			} else {
				await axios.post('/api/reviews', { orderId, rating, comment });
			}
			setEditing(false);
			load();
		} catch (err) {
			setError(
				err?.response?.data?.errors?.[0]?.message ||
					'Could not save your review. Please try again.',
			);
		} finally {
			setSaving(false);
		}
	};

	if (!state || !state.reviewable) return null;

	const review = state.review;
	const profileHref = state.sellerId ? `/sellers/${state.sellerId}` : null;

	// Existing review, not editing → show it.
	if (review && !editing) {
		return (
			<div className="sreview">
				<div className="sreview__tag">Your review</div>
				<div className="sreview__shown">
					<Stars value={review.rating} size={18} />
					{review.comment && <p className="sreview__cmt">“{review.comment}”</p>}
				</div>
				<div className="sreview__actions">
					<button type="button" className="btn btn--line" onClick={() => setEditing(true)}>
						Edit review
					</button>
					{profileHref && (
						<Link href="/sellers/[userId]" as={profileHref} className="sreview__link">
							View seller
						</Link>
					)}
				</div>
			</div>
		);
	}

	// No review yet (or editing) → form.
	return (
		<div className="sreview">
			<div className="sreview__tag">{review ? 'Edit your review' : 'Rate the seller'}</div>
			<p className="sreview__lead">How was the handoff? Your rating helps other buyers.</p>
			<StarPicker value={rating} onChange={setRating} />
			<textarea
				className="sreview__text"
				placeholder="Add a comment (optional)"
				maxLength={1000}
				value={comment}
				onChange={(e) => setComment(e.target.value)}
			/>
			{error && <div className="card-error">{error}</div>}
			<div className="sreview__actions">
				<button
					type="button"
					className="btn btn--red"
					onClick={submit}
					disabled={saving}
				>
					{saving ? 'Saving…' : review ? 'Save changes' : 'Submit review'}
				</button>
				{review && (
					<button
						type="button"
						className="btn btn--line"
						onClick={() => setEditing(false)}
						disabled={saving}
					>
						Cancel
					</button>
				)}
			</div>
		</div>
	);
};

export default SellerReview;
