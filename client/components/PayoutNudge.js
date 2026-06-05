import { useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';

// Contextual payout nudge for SELLING surfaces (My Listings, list-a-ticket).
// Deliberately NOT global like VerifyBanner: there's no buyer/seller account
// type — selling is an activity — and payout status lives in payments (a Stripe
// round-trip), so we only check it where someone is acting as a seller. Renders
// nothing until we confirm they're NOT enabled yet, so set-up sellers and plain
// buyers never see a flash. Mirrors how StubHub asks for payout details at the
// moment you list/sell rather than nagging everyone.
const PayoutNudge = ({ currentUser }) => {
	const [payouts, setPayouts] = useState(null);
	const [held, setHeld] = useState(0); // $ we're holding until they connect

	useEffect(() => {
		if (!currentUser) return;
		let alive = true;
		Promise.all([
			axios.get('/api/payments/connect/status'),
			axios.get('/api/payments/payouts'),
		])
			.then(([status, earnings]) => {
				if (!alive) return;
				setPayouts(status.data);
				setHeld(earnings.data?.totals?.pending || 0);
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [currentUser]);

	if (!currentUser || !payouts || payouts.payoutsEnabled) return null;

	const started = payouts.detailsSubmitted;
	// Once they have real money waiting, lead with it — it's the strongest nudge.
	const waiting = held > 0;

	return (
		<div className="paynudge stocked" role="status">
			<span className="paynudge__mark" aria-hidden="true" />
			<div className="paynudge__body">
				<b>
					{waiting
						? `$${held.toFixed(2)} waiting — set up payouts to collect it`
						: started
							? 'Finish setting up payouts'
							: 'Set up payouts to get paid'}
				</b>
				<span>
					You can sell without it — we’ll hold your earnings until you connect
					your bank.
				</span>
			</div>
			<Link href="/account?payouts=setup" className="paynudge__cta">
				{started ? 'Finish setup' : 'Set up payouts'}
			</Link>
		</div>
	);
};

export default PayoutNudge;
