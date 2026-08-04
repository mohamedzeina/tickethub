import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import axios from 'axios';
import useRequest from '../hooks/useRequest';

// A payout row's pill: CSS modifier + label per status. One lookup (like the
// payoutField map below) so the class and the wording can't drift apart.
const pillFor = (status) =>
	({
		paid: { cls: 'paid', label: 'Paid' },
		failed: { cls: 'retry', label: 'Retrying' },
	})[status] || { cls: 'held', label: 'Held' };

// Account settings. One "will-call" ticket: the red stub on the left is the
// member's counterfoil (identity + serial + barcode); the right side holds
// perforated tabs — Profile (#18 display name) and Payouts (#11 Stripe Connect).
// Signed-out users are bounced to sign in.
const Account = ({ currentUser }) => {
	const router = useRouter();
	const [name, setName] = useState('');
	const [loaded, setLoaded] = useState(false);
	const [saved, setSaved] = useState(false);

	// #11 payouts: readiness pulled from payments. `null` = still loading.
	const [payouts, setPayouts] = useState(null);
	const [connecting, setConnecting] = useState(false);
	// Seller earnings (their sales): { totals: { paid, pending }, payouts: [...] }.
	const [earnings, setEarnings] = useState(null);
	// Pending earnings — sold but still inside the refund window, so payments
	// hasn't swept them into a payout yet: { totals: { clearing }, sales: [...] }.
	const [clearing, setClearing] = useState(null);

	// Which detachable section is showing. Returning from Stripe onboarding lands
	// on /account?payouts=… so we open the Payouts tab automatically.
	const [tab, setTab] = useState('profile');

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

	// #11 payouts status. Cheap cached read by default; force a Stripe refresh
	// only when the seller just returned from the hosted onboarding flow
	// (return_url → /account?payouts=connected), which is the one moment the
	// flags can have changed. Keeps normal account visits instant.
	useEffect(() => {
		if (!currentUser) return;
		const refresh = router.query.payouts ? '?refresh=1' : '';
		axios
			.get(`/api/payments/connect/status${refresh}`)
			.then(({ data }) => setPayouts(data))
			.catch(() => setPayouts({ connected: false, payoutsEnabled: false }));
	}, [currentUser, router.query.payouts]);

	// Seller earnings summary (cheap Mongo read in payments).
	useEffect(() => {
		if (!currentUser) return;
		axios
			.get('/api/payments/payouts')
			.then(({ data }) => setEarnings(data))
			.catch(() => {});
	}, [currentUser, router.query.payouts]);

	// Pending (clearing) earnings — sold-but-still-refundable sales, owned by
	// orders (payments only learns of a sale once it's swept past the window).
	useEffect(() => {
		if (!currentUser) return;
		axios
			.get('/api/orders/earnings')
			.then(({ data }) => setClearing(data))
			.catch(() => {});
	}, [currentUser, router.query.payouts]);

	// Open Payouts when arriving back from Stripe.
	useEffect(() => {
		if (router.query.payouts) setTab('payouts');
	}, [router.query.payouts]);

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
				<div className="acct acct--solo stocked bordered">
					<div className="acct__panel">
						<div className="acct__eyebrow">Will-Call</div>
						<h1 className="acct__title">Sign in to manage your account</h1>
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

	// Ticket-style serial from the user id — flavor, not security.
	const serial =
		(currentUser.id || '')
			.replace(/[^a-z0-9]/gi, '')
			.slice(-8)
			.toUpperCase()
			.replace(/(.{4})(.{1,4})/, '$1·$2') || '0000·0000';

	// Glanceable payout state on the tab pip + the banner below.
	const payoutState = !payouts
		? 'loading'
		: payouts.payoutsEnabled
			? 'active'
			: payouts.detailsSubmitted
				? 'pending'
				: 'action';

	// Short label for the stub's PAYOUTS detail row.
	const payoutField = {
		loading: '···',
		active: 'Active',
		pending: 'Pending',
		action: 'Off',
	}[payoutState];

	// Short "clears Jun 7" date for a pending sale.
	const fmtClears = (iso) => {
		if (!iso) return '';
		try {
			return new Intl.DateTimeFormat('en-IE', {
				month: 'short',
				day: 'numeric',
			}).format(new Date(iso));
		} catch {
			return '';
		}
	};

	// Merge the seller's earnings into one Clearing → Held → Paid view.
	const clearingSales = clearing?.sales || [];
	const payoutItems = earnings?.payouts || [];
	const showEarnings = clearingSales.length > 0 || payoutItems.length > 0;
	const clearingTotal = clearing?.totals.clearing || 0;
	const heldTotal = earnings?.totals.pending || 0;
	const paidTotal = earnings?.totals.paid || 0;

	return (
		<div className="container container--mid">
			<div className="acct stocked bordered">
				{/* ── counterfoil / member stub ── */}
				<aside className="acct__stub">
					<div className="acct__stub-top">
						<div className="acct__brand">
							TicketHub<span>Will-Call</span>
						</div>
						<div className="acct__valid">✦ Member</div>
					</div>

					<div className="acct__stub-body">
						<div className="acct__holder">
							<div className="acct__holder-lab">Account holder</div>
							<div className="acct__holder-name">
								{loaded ? (
									name || 'Member'
								) : (
									<span
										className="sk sk--light"
										style={{ display: 'block', height: 30, width: '72%', borderRadius: 4 }}
										aria-hidden="true"
									/>
								)}
							</div>
							<div className="acct__holder-email">{currentUser.email}</div>
						</div>

						<div className="acct__rule" aria-hidden="true">
							<span>✦</span>
						</div>

						{/* counterfoil detail rows — real account facts in ticket-stub type */}
						<dl className="acct__fields">
							<div className="acct__field">
								<dt>Admits</dt>
								<dd>One</dd>
							</div>
							<div className="acct__field">
								<dt>Status</dt>
								<dd>{currentUser.emailVerified ? 'Verified ✓' : 'Unverified'}</dd>
							</div>
							<div className="acct__field">
								<dt>Payouts</dt>
								<dd>{payoutField}</dd>
							</div>
						</dl>
					</div>

					<div className="acct__stub-foot">
						<div className="acct__serial">
							<span>No.</span>
							{serial}
						</div>
						<div className="acct__barcode" aria-hidden="true" />
						<div className="acct__fineprint">Non-transferable · Keep this stub</div>
					</div>
				</aside>

				{/* ── actionable panel with perforated tabs ── */}
				<div className="acct__main">
					<div className="acct__tabs" role="tablist" aria-label="Account sections">
						<button
							type="button"
							role="tab"
							id="tab-profile"
							aria-selected={tab === 'profile'}
							aria-controls="panel-profile"
							className={`acct__tab ${tab === 'profile' ? 'is-active' : ''}`}
							onClick={() => setTab('profile')}
						>
							Profile
						</button>
						<button
							type="button"
							role="tab"
							id="tab-payouts"
							aria-selected={tab === 'payouts'}
							aria-controls="panel-payouts"
							className={`acct__tab ${tab === 'payouts' ? 'is-active' : ''}`}
							onClick={() => setTab('payouts')}
						>
							Payouts
							<span
								className={`acct__pip acct__pip--${payoutState}`}
								aria-hidden="true"
							/>
						</button>
					</div>

					{tab === 'profile' && (
						<section
							id="panel-profile"
							role="tabpanel"
							aria-labelledby="tab-profile"
							className="acct__section"
						>
							<h1 className="acct__title">Display name</h1>
							<p className="acct__lede">
								This is how you appear to buyers on your listings and seller
								profile. Leave it blank to go by your anonymous handle instead.
							</p>

							<form className="acct__form" onSubmit={onSubmit}>
								<div className="field">
									<label htmlFor="displayName">Display name</label>
									{loaded ? (
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
									) : (
										<div
											className="sk"
											style={{ height: 49, borderRadius: 3 }}
											aria-hidden="true"
										/>
									)}
									{fieldErrors('displayName')}
								</div>

								{saved && (
									<div className="card-ok">
										Saved.{' '}
										{name
											? `You’ll show up as “${name}”.`
											: 'You’ll show up by your handle.'}
									</div>
								)}

								<button
									type="submit"
									className="btn btn--red btn--block"
									style={{ marginTop: 4 }}
									disabled={!loaded}
								>
									Save name
								</button>
							</form>
						</section>
					)}

					{tab === 'payouts' && (
						<section
							id="panel-payouts"
							role="tabpanel"
							aria-labelledby="tab-payouts"
							className="acct__section"
						>
							<h1 className="acct__title">Seller payouts</h1>
							<p className="acct__lede">
								Connect a payout account to collect your earnings when you sell.
								You can sell without it — we’ll hold what you’re owed until
								you’re set up.
							</p>

							{payoutState === 'loading' ? (
								<div className="acct__status">
									<span
										className="sk"
										style={{ height: 15, width: '78%', borderRadius: 3 }}
										aria-hidden="true"
									/>
								</div>
							) : (
								<div className={`acct__status acct__status--${payoutState}`}>
									<span className="acct__status-dot" aria-hidden="true" />
									<span className="acct__status-text">
										{payoutState === 'active' &&
											'Payouts active. You’ll be paid after each sale clears its refund window.'}
										{payoutState === 'pending' &&
											'Almost there — Stripe is verifying your details. This can take a few minutes.'}
										{payoutState === 'action' &&
											'You’re not set up to receive payouts yet.'}
									</span>
								</div>
							)}

							{/* How it works — surfaces the value above the fold. */}
							<ol className="acct__steps">
								<li>
									<span>1</span> Connect your bank through Stripe (a minute, all
									on Stripe).
								</li>
								<li>
									<span>2</span> Sell tickets — buyers pay TicketHub at checkout.
								</li>
								<li>
									<span>3</span> We pay you out automatically once each sale
									clears its refund window.
								</li>
							</ol>

							{payouts && !payouts.payoutsEnabled && (
								<button
									type="button"
									className="btn btn--red btn--block"
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

							{payouts && payouts.payoutsEnabled && (
								<div className="acct__settled" aria-hidden="true">
									Settled · paid out via Stripe
								</div>
							)}

							{/* Earnings — the seller's own sales, across their lifecycle:
							    Clearing (in refund window) → Held (window passed, not
							    connected) → Paid. Hidden for a pure buyer (no sales). */}
							{showEarnings && (
								<div className="acct__earnings">
									<div className="acct__earnings-tot">
										{clearingTotal > 0 && (
											<div>
												<span className="acct__earnings-lab">Clearing</span>
												<span className="acct__earnings-val acct__earnings-val--clearing">
													€{clearingTotal.toFixed(2)}
												</span>
											</div>
										)}
										<div>
											<span className="acct__earnings-lab">Held</span>
											<span className="acct__earnings-val acct__earnings-val--held">
												€{heldTotal.toFixed(2)}
											</span>
										</div>
										<div>
											<span className="acct__earnings-lab">Paid out</span>
											<span className="acct__earnings-val">
												€{paidTotal.toFixed(2)}
											</span>
										</div>
									</div>
									<ul className="acct__earnings-list">
										{clearingSales.slice(0, 6).map((s) => (
											<li key={s.orderId}>
												<span className="acct__earnings-net">
													€{s.net.toFixed(2)}
												</span>
												<span className="acct__earnings-meta">
													on a €{s.amount.toFixed(2)} sale
													{s.clearsAt ? ` · clears ${fmtClears(s.clearsAt)}` : ''}
												</span>
												<span className="acct__earnings-pill acct__earnings-pill--clearing">
													Clearing
												</span>
											</li>
										))}
										{payoutItems.slice(0, 6).map((p) => {
											const pill = pillFor(p.status);
											return (
												<li key={p.id}>
													<span className="acct__earnings-net">
														€{p.net.toFixed(2)}
													</span>
													<span className="acct__earnings-meta">
														on a €{p.amount.toFixed(2)} sale
													</span>
													<span
														className={`acct__earnings-pill acct__earnings-pill--${pill.cls}`}
													>
														{pill.label}
													</span>
												</li>
											);
										})}
									</ul>
								</div>
							)}
						</section>
					)}
				</div>
			</div>
		</div>
	);
};

export default Account;
