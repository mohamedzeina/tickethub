import axios from 'axios';
import { useState } from 'react';
import Router from 'next/router';
import { signInHref } from '../utils/returnTo';

const useRequest = ({ url, method, body, onSuccess }) => {
	const [errors, setErrors] = useState([]);

	const doRequest = async (props = {}) => {
		try {
			const response = await axios[method](url, { ...body, ...props });

			if (onSuccess) {
				onSuccess(response.data);
			}
		} catch (err) {
			const status = err.response?.status;

			// A 401 means "no valid session" — nothing the user can fix in this
			// form, so bounce them to sign in and bring them back here afterwards
			// (a safety net for any gated action; the UI also offers a proactive
			// "Sign in to …" CTA before they get this far). Authorization/business
			// failures (403/400, e.g. "can't buy your own ticket") are NOT auth
			// problems, so those still surface inline below.
			if (
				status === 401 &&
				typeof window !== 'undefined' &&
				!Router.asPath.startsWith('/auth/')
			) {
				Router.push(signInHref(Router.asPath));
				return;
			}

			setErrors(
				err.response?.data?.errors || [
					{ message: 'Something went wrong. Please try again.' },
				],
			);
		}
	};

	// Helper function to render error messages for a specific field
	const fieldErrors = (field) =>
		errors
			.filter((err) => err.field === field)
			.map((err) => (
				<div key={err.message} className="fielderr">
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
			<div className="formerr" role="alert">
				<ul>
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
