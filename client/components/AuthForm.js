import { useState } from 'react';
import Link from 'next/link';
import Router from 'next/router';
import useRequest from '../hooks/useRequest';

// Shared centered-card form for Sign In / Sign Up. Both screens collect the
// same email + password, so the layout, validation, and submit handling live
// here and each page just passes its copy and endpoint.
const AuthForm = ({ title, subtitle, url, submitLabel, footer }) => {
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

	const inputClasses =
		'w-full rounded-lg border border-brand-200 bg-white px-3.5 py-2.5 text-ink shadow-sm outline-none transition placeholder:text-ink-soft/60 focus:border-brand-500 focus:ring-2 focus:ring-brand-200';

	return (
		<div className="mx-auto mt-6 w-full max-w-md">
			<div className="rounded-2xl border border-brand-100 bg-white p-8 shadow-sm">
				<h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
				{subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}

				<form onSubmit={onSubmit} className="mt-6 space-y-5">
					<div>
						<label
							htmlFor="email"
							className="mb-1.5 block text-sm font-semibold text-ink"
						>
							Email address
						</label>
						<input
							id="email"
							type="email"
							autoComplete="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className={inputClasses}
							placeholder="you@example.com"
						/>
						{fieldErrors('email')}
					</div>

					<div>
						<label
							htmlFor="password"
							className="mb-1.5 block text-sm font-semibold text-ink"
						>
							Password
						</label>
						<input
							id="password"
							type="password"
							autoComplete={
								url.includes('signup') ? 'new-password' : 'current-password'
							}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className={inputClasses}
							placeholder="••••••••"
						/>
						{fieldErrors('password')}
					</div>

					{generalErrors()}

					<button
						type="submit"
						disabled={loading}
						className="w-full cursor-pointer rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{loading ? 'Please wait…' : submitLabel}
					</button>
				</form>
			</div>

			{footer && (
				<p className="mt-5 text-center text-sm text-ink-soft">
					{footer.text}{' '}
					<Link
						href={footer.href}
						className="font-semibold text-brand-700 transition-colors duration-200 hover:text-brand-900"
					>
						{footer.linkLabel}
					</Link>
				</p>
			)}
		</div>
	);
};

export default AuthForm;
