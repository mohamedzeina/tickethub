import { useEffect } from 'react';
import useRequest from '../../hooks/useRequest';
import Router from 'next/router';

const SignOut = () => {
	const { doRequest } = useRequest({
		url: '/api/users/signout',
		method: 'post',
		body: {},
		onSuccess: () => Router.push('/'), // Redirect to home page and reload to update auth state
	});

	useEffect(() => {
		doRequest();
	}, []); // Empty dependency array ensures this runs only once when the component mounts

	return (
		<div className="mx-auto mt-10 w-full max-w-md">
			<div className="flex flex-col items-center rounded-2xl border border-brand-100 bg-white p-10 text-center shadow-sm">
				<span
					className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600"
					aria-hidden="true"
				/>
				<h1 className="mt-5 font-display text-xl font-bold text-ink">
					Signing you out…
				</h1>
				<p className="mt-1 text-sm text-ink-soft">
					Hang tight, we&apos;ll take you back home.
				</p>
			</div>
		</div>
	);
};

export default SignOut;
