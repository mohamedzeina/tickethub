import { useState } from 'react';
import axios from 'axios';

const SignUp = () => {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [errors, setErrors] = useState([]);

	const onSubmit = async (e) => {
		e.preventDefault(); // Prevent the default form submission behavior

		try {
			const response = await axios.post('/api/users/signup', {
				email,
				password,
			});

			console.log(response.data);
		} catch (err) {
			setErrors(err.response.data.errors);
		}
	};

	// Helper function to render error messages for a specific field
	const fieldErrors = (field) =>
		errors
			.filter((err) => err.field === field)
			.map((err) => (
				<div key={err.message} className="text-danger mt-1">
					{err.message}
				</div>
			));

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
