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

	return <div>Signing you out...</div>;
};

export default SignOut;
