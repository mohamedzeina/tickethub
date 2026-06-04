import { useState } from 'react';
import Link from 'next/link';
import Router from 'next/router';
import useRequest from '../hooks/useRequest';

// Shared "Will Call" window for Sign In / Sign Up. Both screens collect the
// same email + password, so the layout, validation, and submit handling live
// here and each page just passes its copy and endpoint.
const AuthForm = ({ title, subtitle, url, submitLabel, footer, forgotHref }) => {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [loading, setLoading] = useState(false);

	const { doRequest, fieldErrors, generalErrors } = useRequest({
		url,
		method: 'post',
		body: { email, password },
		onSuccess: () => Router.push('/'),
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
						Your seat
						<br />is
						<br />waiting.
					</div>
					<div className="lab">Sign in to buy &amp; sell</div>
				</div>

				<div className="willcall__form">
					<h1>{title}</h1>
					{subtitle && <p>{subtitle}</p>}

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

						<div className="field">
							<label htmlFor="password">
								Password
								{forgotHref && (
									<Link href={forgotHref} className="field__aside">
										Forgot?
									</Link>
								)}
							</label>
							<input
								id="password"
								type="password"
								autoComplete={
									url.includes('signup') ? 'new-password' : 'current-password'
								}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="••••••••"
							/>
							{fieldErrors('password')}
						</div>

						{generalErrors()}

						<button type="submit" disabled={loading} className="btn btn--red btn--block">
							{loading ? 'Please wait…' : submitLabel}
						</button>
					</form>

					{footer && (
						<p className="altline">
							{footer.text}{' '}
							<Link href={footer.href}>{footer.linkLabel}</Link>
						</p>
					)}
				</div>
			</div>
		</div>
	);
};

export default AuthForm;
