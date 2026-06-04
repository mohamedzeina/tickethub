import { useState } from 'react';
import Link from 'next/link';
import useRequest from '../../hooks/useRequest';

// Step 1 of reset: collect an email and ask auth to send a link. The API always
// returns 200 (no email enumeration), so we always show the same confirmation.
const ForgotPassword = () => {
	const [email, setEmail] = useState('');
	const [loading, setLoading] = useState(false);
	const [done, setDone] = useState(false);

	const { doRequest, fieldErrors, generalErrors } = useRequest({
		url: '/api/users/forgot-password',
		method: 'post',
		body: { email },
		onSuccess: () => setDone(true),
	});

	const onSubmit = async (e) => {
		e.preventDefault();
		setLoading(true);
		await doRequest();
		setLoading(false);
	};

	return (
		<div className="container container--mid">
			<div className="willcall stocked bordered">
				<div className="willcall__stub">
					<div className="lab">TicketHub Account</div>
					<div className="big">
						Lost
						<br />your
						<br />key?
					</div>
					<div className="lab">We&apos;ll send a reset link</div>
				</div>

				<div className="willcall__form">
					{done ? (
						<>
							<h1>Check your inbox</h1>
							<p>
								If an account exists for <b>{email}</b>, a password reset link is on
								its way. The link expires in 1 hour.
							</p>
							<p className="altline">
								<Link href="/auth/signin">Back to sign in</Link>
							</p>
						</>
					) : (
						<>
							<h1>Reset password</h1>
							<p>Enter your email and we&apos;ll send you a reset link.</p>

							<form className="form" onSubmit={onSubmit} style={{ marginTop: 24 }}>
								<div className="field">
									<label htmlFor="email">Email address</label>
									<input
										id="email"
										type="email"
										autoComplete="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										placeholder="you@example.com"
									/>
									{fieldErrors('email')}
								</div>

								{generalErrors()}

								<button
									type="submit"
									disabled={loading}
									className="btn btn--red btn--block"
								>
									{loading ? 'Please wait…' : 'Send reset link'}
								</button>
							</form>

							<p className="altline">
								Remembered it? <Link href="/auth/signin">Sign in</Link>
							</p>
						</>
					)}
				</div>
			</div>
		</div>
	);
};

export default ForgotPassword;
