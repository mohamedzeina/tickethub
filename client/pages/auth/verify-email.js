import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useRequest from '../../hooks/useRequest';

// Landing page for the verification link (?token=…). Submits the token once on
// load and reports the outcome. auth refreshes the session cookie on success,
// so navigating away picks up the verified state (the banner disappears).
const VerifyEmail = () => {
	const router = useRouter();
	const token = router.query.token || '';
	const [status, setStatus] = useState('pending'); // pending | ok | fail

	const { doRequest, errors } = useRequest({
		url: '/api/users/verify-email',
		method: 'post',
		body: { token },
		onSuccess: () => setStatus('ok'),
	});

	useEffect(() => {
		if (!router.isReady) return;
		if (token) {
			doRequest();
		} else {
			setStatus('fail');
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router.isReady]);

	useEffect(() => {
		if (errors && errors.length) setStatus('fail');
	}, [errors]);

	return (
		<div className="container container--mid">
			<div className="willcall stocked bordered">
				<div className="willcall__stub">
					<div className="lab">TicketHub Account</div>
					<div className="big">
						Email
						<br />check.
					</div>
					<div className="lab">Confirming your address</div>
				</div>

				<div className="willcall__form">
					{status === 'pending' && (
						<>
							<h1>Verifying…</h1>
							<p>Hang tight while we confirm your email address.</p>
						</>
					)}

					{status === 'ok' && (
						<>
							<h1>You&apos;re verified ✓</h1>
							<p>
								Thanks — your email is confirmed. You can now buy and sell tickets on
								TicketHub.
							</p>
							<Link
								href="/"
								className="btn btn--red btn--block"
								style={{ marginTop: 24 }}
							>
								Browse tickets
							</Link>
						</>
					)}

					{status === 'fail' && (
						<>
							<h1>Link expired</h1>
							<p>
								This verification link is invalid or has expired. Sign in and use the
								banner at the top to send yourself a fresh one.
							</p>
							<Link
								href="/auth/signin"
								className="btn btn--red btn--block"
								style={{ marginTop: 24 }}
							>
								Sign in
							</Link>
						</>
					)}
				</div>
			</div>
		</div>
	);
};

export default VerifyEmail;
