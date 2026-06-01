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
				<div key={err.message} className="mt-1 text-sm font-medium text-red-600">
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
			<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
				<ul className="my-0 list-disc space-y-1 pl-5">
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
