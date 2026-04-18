import { useState } from 'react';
import Router from 'next/router';
import useRequest from '../../hooks/useRequest';

const SignUp = () => {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const { doRequest, errors, fieldErrors } = useRequest({
		url: '/api/users/signup',
		method: 'post',
		body: { email, password },
		onSuccess: () => Router.push('/'),
	});

	const onSubmit = async (e) => {
		e.preventDefault(); // Prevent the default form submission behavior
		doRequest();
	};

	return (
		<form onSubmit={onSubmit}>
			<h1>Sign Up</h1>
			<div className="form-group">
				<label> Email Address</label>
				<input
					value={email}
					onChange={(e) => {
						setEmail(e.target.value);
					}}
					className="form-control"
				/>
				{fieldErrors('email')}
			</div>
			<div className="form-group">
				<label> Password</label>
				<input
					value={password}
					onChange={(e) => {
						setPassword(e.target.value);
					}}
					className="form-control"
					type="password"
				/>
				{fieldErrors('password')}
			</div>

			<button className="btn btn-primary mt-3">Sign Up</button>
		</form>
	);
};

export default SignUp;
