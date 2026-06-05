import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import axios from 'axios';
import useRequest from '../hooks/useRequest';

// Account settings (#18). The public display name (the name other buyers see on
// your listings and reviews instead of an opaque handle) plus seller payouts
// (#11 — connect a Stripe account to get paid). Signed-out users are bounced to
// sign in.
const Account = ({ currentUser }) => {
	const router = useRouter();
	const [name, setName] = useState('');
	const [loaded, setLoaded] = useState(false);
	const [saved, setSaved] = useState(false);

	// #11 payouts: readiness pulled from payments. `null` = still loading.
	const [payouts, setPayouts] = useState(null);
	const [connecting, setConnecting] = useState(false);

	const { doRequest, errors, fieldErrors } = useRequest({
		url: '/api/users/me',
		method: 'patch',
		body: { displayName: name },
		onSuccess: (user) => {
			setSaved(true);
			setName(user.displayName || '');
		},
	});

	// Load the current name (display-only field, read on demand — not in the JWT).
	useEffect(() => {
		if (!currentUser) return;
		axios
			.get(`/api/users/${currentUser.id}`)
			.then(({ data }) => setName(data.displayName || ''))
			.catch(() => {})
			.finally(() => setLoaded(true));
	}, [currentUser]);

	// #11 payouts status. The GET hits Stripe to refresh readiness, so it also
	// catches the seller returning from the hosted onboarding flow
	// (return_url → /account?payouts=connected): we just re-read and the flags
	// reflect their new state.
	useEffect(() => {
		if (!currentUser) return;
		axios
			.get('/api/payments/connect/status')
			.then(({ data }) => setPayouts(data))
			.catch(() => setPayouts({ connected: false, payoutsEnabled: false }));
	}, [currentUser, router.query.payouts]);

	// Kick off (or resume) Stripe Connect onboarding and hand off to the hosted
	// page. We never see card/bank details — Stripe owns that.
	const startOnboarding = async () => {
		setConnecting(true);
		try {
			const { data } = await axios.post('/api/payments/connect/onboard', {});
			window.location.href = data.url;
		} catch {
			setConnecting(false);
		}
	};

	if (!currentUser) {
		return (
			<div className="container container--mid">
				<div className="willcall stocked bordered">
					<div className="willcall__form">
						<h1>Sign in to manage your account</h1>
						<Link href="/auth/signin" className="btn btn--red btn--block" style={{ marginTop: 24 }}>
							Sign in
						</Link>
					</div>
				</div>
			</div>
		);
	}

	const onSubmit = (e) => {
		e.preventDefault();
		setSaved(false);
		doRequest();
	};

	return (
		<div className="container container--mid">
			<div className="willcall stocked bordered">
				<div className="willcall__stub">
					<div className="lab">TicketHub Account</div>
					<div className="big">
						Your
						<br />name.
					</div>
					<div className="lab">{currentUser.email}</div>
				</div>

				<form className="willcall__form" onSubmit={onSubmit}>
					<h1>Display name</h1>
					<p>
						This is how you appear to buyers on your listings and seller profile.
						Leave it blank to go by your anonymous handle instead.
					</p>

					<div className="field">
						<label htmlFor="displayName">Display name</label>
						<input
							id="displayName"
							value={name}
							maxLength={40}
							placeholder="e.g. Jane from NYC"
							onChange={(e) => {
								setName(e.target.value);
								setSaved(false);
							}}
						/>
						{fieldErrors('displayName')}
					</div>

					{saved && (
						<div className="card-ok">
							Saved. {name ? `You’ll show up as “${name}”.` : 'You’ll show up by your handle.'}
						</div>
					)}

					<button
						type="submit"
						className="btn btn--red btn--block"
						style={{ marginTop: 20 }}
						disabled={!loaded}
					>
						Save name
					</button>
				</form>
			</div>

			{/* #11 — seller payouts. Selling isn't gated on this; sellers can list
			    and sell first and connect later (earnings are held until they do). */}
			<div className="willcall stocked bordered payouts" style={{ marginTop: 28 }}>
				<div className="willcall__stub">
					<div className="lab">Seller payouts</div>
					<div className="big">
						Get
						<br />paid.
					</div>
					<div className="lab">Powered by Stripe</div>
				</div>

				<div className="willcall__form">
					<h1>Payouts</h1>
					<p>
						Connect a payout account to collect your earnings when you sell.
						You can sell without it — we’ll hold what you’re owed until you’re set up.
					</p>

					{payouts === null ? (
						<div className="payouts__status payouts__status--muted">Checking payout status…</div>
					) : payouts.payoutsEnabled ? (
						<div className="payouts__status payouts__status--ok">
							Payouts active. You’ll be paid after each sale clears its refund window.
						</div>
					) : payouts.detailsSubmitted ? (
						<div className="payouts__status payouts__status--pending">
							Almost there — Stripe is verifying your details. This can take a few minutes.
						</div>
					) : (
						<div className="payouts__status payouts__status--muted">
							You’re not set up to receive payouts yet.
						</div>
					)}

					{payouts && !payouts.payoutsEnabled && (
						<button
							type="button"
							className="btn btn--red btn--block"
							style={{ marginTop: 20 }}
							onClick={startOnboarding}
							disabled={connecting}
						>
							{connecting
								? 'Redirecting to Stripe…'
								: payouts.detailsSubmitted
									? 'Finish payout setup'
									: 'Set up payouts'}
						</button>
					)}
				</div>
			</div>
		</div>
	);
};

export default Account;
