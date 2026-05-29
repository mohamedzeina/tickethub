import axios from 'axios';
import { useState } from 'react';

const useRequest = ({ url, method, body, onSuccess }) => {
	const [errors, setErrors] = useState([]);

	const doRequest = async (props = {}) => {
		try {
			const response = await axios[method](url, { ...body, ...props });

			if (onSuccess) {
				onSuccess(response.data);
			}
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

	// Helper function to render errors not tied to a field (e.g. "Not authorized")
	const generalErrors = () => {
		const general = errors.filter((err) => !err.field);

		if (general.length === 0) {
			return null;
		}

		return (
			<div className="alert alert-danger mt-3">
				<ul className="my-0">
					{general.map((err) => (
						<li key={err.message}>{err.message}</li>
					))}
				</ul>
			</div>
		);
	};

	return { doRequest, errors, fieldErrors, generalErrors };
};

export default useRequest;
