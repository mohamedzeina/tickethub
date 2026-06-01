import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { SearchIcon } from './icons';
import { formatPrice } from '../utils/ticket';

// Global search living in the nav. Types ahead with live ticket suggestions;
// Enter (or "see all") goes to the full /search results page, while picking a
// suggestion jumps straight to that event. Suggestions come from the same
// tickets endpoint with a small limit, so no new backend is needed.
const NavSearch = () => {
	const router = useRouter();
	const ref = useRef(null);
	const [term, setTerm] = useState('');
	const [open, setOpen] = useState(false);
	const [results, setResults] = useState([]);
	const [active, setActive] = useState(-1);

	const trimmed = term.trim();

	// Debounced typeahead — wait for a pause in typing before hitting the API.
	useEffect(() => {
		if (trimmed.length < 2) {
			setResults([]);
			return;
		}
		let cancelled = false;
		const id = setTimeout(async () => {
			try {
				const { data } = await axios.get('/api/tickets', {
					params: { q: trimmed, limit: 6 },
				});
				if (!cancelled) {
					setResults(data.tickets);
					setActive(-1);
				}
			} catch {
				if (!cancelled) setResults([]);
			}
		}, 180);
		return () => {
			cancelled = true;
			clearTimeout(id);
		};
	}, [trimmed]);

	// Close the menu on outside click, and whenever navigation completes.
	useEffect(() => {
		const onDown = (e) => {
			if (ref.current && !ref.current.contains(e.target)) setOpen(false);
		};
		document.addEventListener('mousedown', onDown);
		return () => document.removeEventListener('mousedown', onDown);
	}, []);

	const goToSearch = () => {
		if (!trimmed) return;
		setOpen(false);
		router.push(`/search?q=${encodeURIComponent(trimmed)}`);
	};

	const goToTicket = (id) => {
		setOpen(false);
		router.push(`/tickets/${id}`);
	};

	const onSubmit = (e) => {
		e.preventDefault();
		if (active >= 0 && results[active]) goToTicket(results[active].id);
		else goToSearch();
	};

	const onKeyDown = (e) => {
		if (e.key === 'Escape') return setOpen(false);
		if (!results.length) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setActive((i) => Math.min(i + 1, results.length - 1));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setActive((i) => Math.max(i - 1, -1));
		}
	};

	const showMenu = open && trimmed.length >= 2;

	return (
		<form className="navsearch" ref={ref} onSubmit={onSubmit} role="search">
			<span className="navsearch__icon" aria-hidden="true">
				<SearchIcon style={{ width: 16, height: 16 }} />
			</span>
			<input
				type="search"
				className="navsearch__input"
				value={term}
				onChange={(e) => {
					setTerm(e.target.value);
					setOpen(true);
				}}
				onFocus={() => setOpen(true)}
				onKeyDown={onKeyDown}
				placeholder="Search events…"
				aria-label="Search events"
				aria-expanded={showMenu}
				autoComplete="off"
			/>

			{showMenu && (
				<div className="navsearch__menu" role="listbox">
					{results.length === 0 ? (
						<div className="navsearch__empty">
							Press <b>Enter</b> to search “{trimmed}”
						</div>
					) : (
						<>
							{results.map((t, i) => (
								<button
									type="button"
									key={t.id}
									role="option"
									aria-selected={i === active}
									className={`navsearch__opt${i === active ? ' is-active' : ''}`}
									onMouseEnter={() => setActive(i)}
									onClick={() => goToTicket(t.id)}
								>
									<span className="navsearch__opt-main">
										<span className="navsearch__opt-title">{t.title}</span>
										<span className="navsearch__opt-meta">
											{[t.venue, t.category].filter(Boolean).join(' · ') ||
												'Event'}
										</span>
									</span>
									<span className="navsearch__opt-price">
										{formatPrice(t.price)}
									</span>
								</button>
							))}
							<button
								type="button"
								className="navsearch__all"
								onClick={goToSearch}
							>
								See all results for “{trimmed}”
							</button>
						</>
					)}
				</div>
			)}
		</form>
	);
};

export default NavSearch;
