import { useState } from 'react';
import axios from 'axios';
import Router from 'next/router';
import useRequest from '../../hooks/useRequest';
import { Upload } from '../../components/icons';

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

	return (
		<div className="container container--mid">
			<div className="sheet stocked bordered">
				<div className="sheet__head">
					<div className="eyebrow">Fill out a blank · publish instantly</div>
					<h1>Issue a Ticket</h1>
					<p>
						Print your seat to the marketplace — buyers see it the moment you
						sign it off.
					</p>
				</div>

				<div className="sheet__body">
					<form className="form" onSubmit={onSubmit}>
						<div className="field">
							<label htmlFor="title">Event title</label>
							<input
								id="title"
								required
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="e.g. Coldplay — Music of the Spheres"
							/>
							{fieldErrors('title')}
						</div>

						<div className="two">
							<div className="field">
								<label htmlFor="eventDate">Event date</label>
								<input
									id="eventDate"
									type="date"
									required
									value={eventDate}
									onChange={(e) => setEventDate(e.target.value)}
								/>
								{fieldErrors('eventDate')}
							</div>

							<div className="field">
								<label htmlFor="category">Category</label>
								<select
									id="category"
									value={category}
									onChange={(e) => setCategory(e.target.value)}
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

						<div className="field">
							<label htmlFor="venue">Venue</label>
							<input
								id="venue"
								required
								value={venue}
								onChange={(e) => setVenue(e.target.value)}
								placeholder="e.g. Wembley Stadium, London"
							/>
							{fieldErrors('venue')}
						</div>

						<div className="field">
							<label htmlFor="description">
								Description <span className="opt">(optional)</span>
							</label>
							<textarea
								id="description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								rows={3}
								placeholder="Seat view, what's included, why you're selling…"
							/>
							{fieldErrors('description')}
						</div>

						<div className="field">
							<label>
								Poster image <span className="opt">(optional)</span>
							</label>

							{imageUrl ? (
								<div className="preview">
									<img src={imageUrl} alt="Ticket preview" />
									<button type="button" onClick={() => setImageUrl('')}>
										Remove
									</button>
								</div>
							) : (
								<label className={`dropzone${uploading ? ' is-busy' : ''}`}>
									{uploading ? (
										<>
											<span className="spinner" aria-hidden="true" />
											<small>Uploading…</small>
										</>
									) : (
										<>
											<Upload />
											<b>Click to upload</b>
											<small>PNG / JPG · uploaded straight to Cloudinary</small>
										</>
									)}
									<input
										type="file"
										accept="image/*"
										onChange={handleImageUpload}
										style={{ display: 'none' }}
										disabled={uploading}
									/>
								</label>
							)}

							{uploadError && <div className="upload-error">{uploadError}</div>}
							{fieldErrors('imageUrl')}
						</div>

						<div className="field">
							<label htmlFor="price">Price</label>
							<div className="price-wrap">
								<span>$</span>
								<input
									id="price"
									inputMode="decimal"
									required
									value={price}
									onBlur={onBlur}
									onChange={(e) => setPrice(e.target.value)}
									placeholder="0.00"
								/>
							</div>
							{fieldErrors('price')}
						</div>

						{generalErrors()}

						<button type="submit" disabled={loading} className="btn btn--red btn--block">
							{loading ? 'Publishing…' : 'Sign & Publish Ticket'}
						</button>
					</form>
				</div>
			</div>
		</div>
	);
};

export default NewTicket;
