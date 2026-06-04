import { useState } from 'react';
import Link from 'next/link';
import Router, { useRouter } from 'next/router';
import useRequest from '../../hooks/useRequest';

// Step 2 of reset: the link carries ?token=…; collect a new password and submit.
// On success auth signs the user straight in, so we go home.
const ResetPassword = () => {
	const router = useRouter();
	const token = router.query.token || '';

	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [mismatch, setMismatch] = useState(false);
	const [loading, setLoading] = useState(false);

	const { doRequest, fieldErrors, generalErrors } = useRequest({
		url: '/api/users/reset-password',
		method: 'post',
		body: { token, password },
		onSuccess: () => Router.push('/'),
	});

	const onSubmit = async (e) => {
		e.preventDefault();
		if (password !== confirm) {
			setMismatch(true);
			return;
		}
		setMismatch(false);
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
						New
						<br />password,
						<br />fresh start.
					</div>
					<div className="lab">Choose a new password</div>
				</div>

				<div className="willcall__form">
					<h1>Set a new password</h1>
					<p>Pick something between 4 and 20 characters.</p>

					<form className="form" onSubmit={onSubmit} style={{ marginTop: 24 }}>
						<div className="field">
							<label htmlFor="password">New password</label>
							<input
								id="password"
								type="password"
								autoComplete="new-password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="••••••••"
							/>
							{fieldErrors('password')}
						</div>

						<div className="field">
							<label htmlFor="confirm">Confirm password</label>
							<input
								id="confirm"
								type="password"
								autoComplete="new-password"
								value={confirm}
								onChange={(e) => setConfirm(e.target.value)}
								placeholder="••••••••"
							/>
							{mismatch && (
								<div className="mt-1 text-sm font-medium text-red-600">
									Passwords don&apos;t match
								</div>
							)}
						</div>

						{generalErrors()}

						<button
							type="submit"
							disabled={loading || !token}
							className="btn btn--red btn--block"
						>
							{loading ? 'Please wait…' : 'Reset password'}
						</button>
					</form>

					<p className="altline">
						<Link href="/auth/signin">Back to sign in</Link>
					</p>
				</div>
			</div>
		</div>
	);
};

export default ResetPassword;
