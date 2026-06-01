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

	// Kept deliberately minimal and dark-themed: the request resolves almost
	// instantly, so a bright ticket-stock card would just flash before the
	// redirect home. A quiet centered loader avoids that pop.
	return (
		<div className="signout">
			<span className="spinner" aria-hidden="true" />
			<div className="signout__label">Signing you out…</div>
		</div>
	);
};

export default SignOut;
