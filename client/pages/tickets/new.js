import { useState } from 'react';
import Router from 'next/router';
import useRequest from '../../hooks/useRequest';

const NewTicket = () => {
	const [title, setTitle] = useState('');
	const [price, setPrice] = useState('');
	const [loading, setLoading] = useState(false);

	const { doRequest, fieldErrors, generalErrors } = useRequest({
		url: '/api/tickets',
		method: 'post',
		body: { title, price },
		onSuccess: () => Router.push('/'),
	});

	const onSubmit = async (event) => {
		event.preventDefault();
		setLoading(true);
		await doRequest();
		setLoading(false);
	};

	const onBlur = () => {
		const value = parseFloat(price);
		if (isNaN(value)) {
			return;
		}
		setPrice(value.toFixed(2));
	};

	const inputClasses =
		'w-full rounded-lg border border-brand-200 bg-white px-3.5 py-2.5 text-ink shadow-sm outline-none transition placeholder:text-ink-soft/60 focus:border-brand-500 focus:ring-2 focus:ring-brand-200';

	return (
		<div className="mx-auto mt-6 w-full max-w-lg">
			<div className="rounded-2xl border border-brand-100 bg-white p-8 shadow-sm">
				<h1 className="font-display text-2xl font-bold text-ink">
					List a ticket
				</h1>
				<p className="mt-1 text-sm text-ink-soft">
					Set your price and reach buyers instantly.
				</p>

				<form onSubmit={onSubmit} className="mt-6 space-y-5">
					<div>
						<label
							htmlFor="title"
							className="mb-1.5 block text-sm font-semibold text-ink"
						>
							Event title
						</label>
						<input
							id="title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							className={inputClasses}
							placeholder="e.g. Coldplay — Music of the Spheres"
						/>
						{fieldErrors('title')}
					</div>

					<div>
						<label
							htmlFor="price"
							className="mb-1.5 block text-sm font-semibold text-ink"
						>
							Price
						</label>
						<div className="relative">
							<span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-ink-soft">
								$
							</span>
							<input
								id="price"
								inputMode="decimal"
								value={price}
								onBlur={onBlur}
								onChange={(e) => setPrice(e.target.value)}
								className={`${inputClasses} pl-7`}
								placeholder="0.00"
							/>
						</div>
						{fieldErrors('price')}
					</div>

					{generalErrors()}

					<button
						type="submit"
						disabled={loading}
						className="w-full cursor-pointer rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-accent-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{loading ? 'Listing…' : 'List ticket'}
					</button>
				</form>
			</div>
		</div>
	);
};

export default NewTicket;
