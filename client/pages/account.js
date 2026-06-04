import { useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import useRequest from '../hooks/useRequest';

// Account settings (#18). Currently just the public display name — the name
// other buyers see on your listings and reviews instead of an opaque handle.
// Signed-out users are bounced to sign in.
const Account = ({ currentUser }) => {
	const [name, setName] = useState('');
	const [loaded, setLoaded] = useState(false);
	const [saved, setSaved] = useState(false);

	const { doRequest, errors, fieldErrors } = useRequest({
		url: '/api/users/me',
		method: 'patch',
		body: { displayName: name },
		onSuccess: (user) => {
			setSaved(true);
			setName(user.displayName || '');
		},
	});

	// Load the current name (display-only field, read on demand — not in the JWT).
	useEffect(() => {
		if (!currentUser) return;
		axios
			.get(`/api/users/${currentUser.id}`)
			.then(({ data }) => setName(data.displayName || ''))
			.catch(() => {})
			.finally(() => setLoaded(true));
	}, [currentUser]);

	if (!currentUser) {
		return (
			<div className="container container--mid">
				<div className="willcall stocked bordered">
					<div className="willcall__form">
						<h1>Sign in to manage your account</h1>
						<Link href="/auth/signin" className="btn btn--red btn--block" style={{ marginTop: 24 }}>
							Sign in
						</Link>
					</div>
				</div>
			</div>
		);
	}

	const onSubmit = (e) => {
		e.preventDefault();
		setSaved(false);
		doRequest();
	};

	return (
		<div className="container container--mid">
			<div className="willcall stocked bordered">
				<div className="willcall__stub">
					<div className="lab">TicketHub Account</div>
					<div className="big">
						Your
						<br />name.
					</div>
					<div className="lab">{currentUser.email}</div>
				</div>

				<form className="willcall__form" onSubmit={onSubmit}>
					<h1>Display name</h1>
					<p>
						This is how you appear to buyers on your listings and seller profile.
						Leave it blank to go by your anonymous handle instead.
					</p>

					<div className="field">
						<label htmlFor="displayName">Display name</label>
						<input
							id="displayName"
							value={name}
							maxLength={40}
							placeholder="e.g. Jane from NYC"
							onChange={(e) => {
								setName(e.target.value);
								setSaved(false);
							}}
						/>
						{fieldErrors('displayName')}
					</div>

					{saved && (
						<div className="card-ok">
							Saved. {name ? `You’ll show up as “${name}”.` : 'You’ll show up by your handle.'}
						</div>
					)}

					<button
						type="submit"
						className="btn btn--red btn--block"
						style={{ marginTop: 20 }}
						disabled={!loaded}
					>
						Save name
					</button>
				</form>
			</div>
		</div>
	);
};

export default Account;
