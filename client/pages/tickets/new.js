import { useState } from 'react';
import Router from 'next/router';
import useRequest from '../../hooks/useRequest';

const CATEGORIES = ['Concerts', 'Sports', 'Theater', 'Festivals', 'Other'];

const NewTicket = () => {
	const [title, setTitle] = useState('');
	const [price, setPrice] = useState('');
	const [eventDate, setEventDate] = useState('');
	const [venue, setVenue] = useState('');
	const [category, setCategory] = useState('Concerts');
	const [description, setDescription] = useState('');
	const [imageUrl, setImageUrl] = useState('');
	const [loading, setLoading] = useState(false);

	const { doRequest, fieldErrors, generalErrors } = useRequest({
		url: '/api/tickets',
		method: 'post',
		body: { title, price, eventDate, venue, category, description, imageUrl },
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
	const labelClasses = 'mb-1.5 block text-sm font-semibold text-ink';

	return (
		<div className="mx-auto mt-6 w-full max-w-lg">
			<div className="rounded-2xl border border-brand-100 bg-white p-8 shadow-sm">
				<h1 className="font-display text-2xl font-bold text-ink">
					List a ticket
				</h1>
				<p className="mt-1 text-sm text-ink-soft">
					Add the event details and your price to reach buyers instantly.
				</p>

				<form onSubmit={onSubmit} className="mt-6 space-y-5">
					<div>
						<label htmlFor="title" className={labelClasses}>
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

					<div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
						<div>
							<label htmlFor="eventDate" className={labelClasses}>
								Event date
							</label>
							<input
								id="eventDate"
								type="date"
								value={eventDate}
								onChange={(e) => setEventDate(e.target.value)}
								className={inputClasses}
							/>
							{fieldErrors('eventDate')}
						</div>

						<div>
							<label htmlFor="category" className={labelClasses}>
								Category
							</label>
							<select
								id="category"
								value={category}
								onChange={(e) => setCategory(e.target.value)}
								className={`${inputClasses} cursor-pointer`}
							>
								{CATEGORIES.map((c) => (
									<option key={c} value={c}>
										{c}
									</option>
								))}
							</select>
							{fieldErrors('category')}
						</div>
					</div>

					<div>
						<label htmlFor="venue" className={labelClasses}>
							Venue
						</label>
						<input
							id="venue"
							value={venue}
							onChange={(e) => setVenue(e.target.value)}
							className={inputClasses}
							placeholder="e.g. Wembley Stadium, London"
						/>
						{fieldErrors('venue')}
					</div>

					<div>
						<label htmlFor="description" className={labelClasses}>
							Description{' '}
							<span className="font-normal text-ink-soft">(optional)</span>
						</label>
						<textarea
							id="description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={3}
							className={`${inputClasses} resize-y`}
							placeholder="Seat location, what's included, why you're selling…"
						/>
						{fieldErrors('description')}
					</div>

					<div>
						<label htmlFor="imageUrl" className={labelClasses}>
							Image URL{' '}
							<span className="font-normal text-ink-soft">(optional)</span>
						</label>
						<input
							id="imageUrl"
							type="url"
							value={imageUrl}
							onChange={(e) => setImageUrl(e.target.value)}
							className={inputClasses}
							placeholder="https://…"
						/>
						{fieldErrors('imageUrl')}
					</div>

					<div>
						<label htmlFor="price" className={labelClasses}>
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
