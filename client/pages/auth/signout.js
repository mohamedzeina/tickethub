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
		<div className="container container--narrow">
			<div className="empty stocked bordered">
				<span className="spinner" aria-hidden="true" style={{ margin: '0 auto 18px' }} />
				<h3>Signing you out…</h3>
				<p>Hang tight — we&apos;ll take you back home.</p>
			</div>
		</div>
	);
};

export default SignOut;
