import { useState } from 'react';
import axios from 'axios';
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
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState(null);
	const [loading, setLoading] = useState(false);

	// Signed direct upload: ask our API to sign the request, then upload the
	// file straight to Cloudinary and keep the returned secure URL.
	const handleImageUpload = async (e) => {
		const file = e.target.files && e.target.files[0];
		if (!file) return;

		setUploading(true);
		setUploadError(null);
		try {
			const { data: sig } = await axios.get('/api/tickets/upload-signature');

			const form = new FormData();
			form.append('file', file);
			form.append('api_key', sig.apiKey);
			form.append('timestamp', sig.timestamp);
			form.append('signature', sig.signature);
			form.append('folder', sig.folder);

			const { data } = await axios.post(
				`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
				form,
			);
			setImageUrl(data.secure_url);
		} catch (err) {
			setUploadError('Upload failed. Please try another image.');
		} finally {
			setUploading(false);
		}
	};

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
							required
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
								required
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
							required
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
						<label className={labelClasses}>
							Image{' '}
							<span className="font-normal text-ink-soft">(optional)</span>
						</label>

						{imageUrl ? (
							<div className="relative overflow-hidden rounded-lg border border-brand-200">
								<img
									src={imageUrl}
									alt="Ticket preview"
									className="h-40 w-full object-cover"
								/>
								<button
									type="button"
									onClick={() => setImageUrl('')}
									className="absolute right-2 top-2 cursor-pointer rounded-md bg-black/60 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-black/80"
								>
									Remove
								</button>
							</div>
						) : (
							<label
								className={`flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-brand-200 bg-brand-50/50 text-sm text-ink-soft transition-colors hover:border-brand-400 hover:bg-brand-50 ${
								uploading ? 'pointer-events-none opacity-70' : ''
							}`}
							>
								{uploading ? (
									<>
										<span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
										<span>Uploading…</span>
									</>
								) : (
									<>
										<svg
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth={1.8}
											strokeLinecap="round"
											strokeLinejoin="round"
											className="h-7 w-7 text-brand-400"
											aria-hidden="true"
										>
											<path d="M12 16V4M7 9l5-5 5 5" />
											<path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
										</svg>
										<span className="font-semibold text-brand-700">
											Click to upload
										</span>
										<span className="text-xs">PNG, JPG up to ~10MB</span>
									</>
								)}
								<input
									type="file"
									accept="image/*"
									onChange={handleImageUpload}
									className="hidden"
									disabled={uploading}
								/>
							</label>
						)}

						{uploadError && (
							<div className="mt-1 text-sm font-medium text-red-600">
								{uploadError}
							</div>
						)}
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
								required
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
