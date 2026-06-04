import { useState } from 'react';
import { useRouter } from 'next/router';
import useRequest from '../hooks/useRequest';

// Slim notice shown to signed-in users who haven't confirmed their email (#7).
// Verification gates listing + buying, so we nudge with a one-click resend.
const VerifyBanner = ({ currentUser }) => {
	const router = useRouter();
	const [sent, setSent] = useState(false);

	const { doRequest } = useRequest({
		url: '/api/users/resend-verification',
		method: 'post',
		body: {},
		onSuccess: () => setSent(true),
	});

	// Never show it on the auth pages themselves — `currentUser` only refreshes
	// on navigation, so on /auth/verify-email it would still read "unverified"
	// and contradict the "You're verified ✓" card (with a live Resend button).
	if (router.pathname.startsWith('/auth/')) {
		return null;
	}

	// Treat a missing flag (tokens minted before #7) as unverified.
	if (!currentUser || currentUser.emailVerified) {
		return null;
	}

	return (
		<div className="verifybar">
			<div className="verifybar__in">
				<span className="verifybar__txt">
					<b>Confirm your email to buy or sell.</b> We sent a verification link to{' '}
					<span className="verifybar__mail">{currentUser.email}</span>.
				</span>
				{sent ? (
					<span className="verifybar__done">Sent ✓ — check your inbox</span>
				) : (
					<button
						type="button"
						className="verifybar__btn"
						onClick={() => doRequest()}
					>
						Resend email
					</button>
				)}
			</div>
		</div>
	);
};

export default VerifyBanner;
