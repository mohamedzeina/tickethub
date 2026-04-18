import axios from 'axios';
import { useState } from 'react';

const useRequest = ({ url, method, body, onSuccess }) => {
	const [errors, setErrors] = useState([]);

	const doRequest = async () => {
		try {
			const response = await axios[method](url, body);

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

	return { doRequest, errors, fieldErrors };
};

export default useRequest;
