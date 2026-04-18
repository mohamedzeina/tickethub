import axios from 'axios';
import { useState } from 'react';

export default (url, method, body) => {
	const [errors, setErrors] = useState([]);

	const doRequest = async () => {
		try {
			const response = await axios[method](url, body);
			return response.data;
		} catch (err) {
			setErrors(err.response.data.errors);
		}
	};

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
