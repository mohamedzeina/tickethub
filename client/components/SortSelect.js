import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from './icons';

// Themed replacement for a native <select>: the OS dropdown can't be styled to
// match the ticket stock, so we render our own popover. Closes on outside click
// or Escape; arrow keys move through options while open.
const SortSelect = ({ value, options, onChange }) => {
	const ref = useRef(null);
	const [open, setOpen] = useState(false);
	const current = options.find((o) => o.value === value) || options[0];

	useEffect(() => {
		if (!open) return;
		const onDown = (e) => {
			if (ref.current && !ref.current.contains(e.target)) setOpen(false);
		};
		const onKey = (e) => {
			if (e.key === 'Escape') return setOpen(false);
			if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
			e.preventDefault();
			const i = options.findIndex((o) => o.value === value);
			const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
			if (options[next]) onChange(options[next].value);
		};
		document.addEventListener('mousedown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	}, [open, options, value, onChange]);

	return (
		<div className="sortselect" ref={ref}>
			<button
				type="button"
				className="sortselect__btn"
				aria-haspopup="listbox"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
			>
				<span>{current.label}</span>
				<ChevronDown className={`sortselect__caret${open ? ' is-open' : ''}`} />
			</button>
			{open && (
				<ul className="sortselect__menu" role="listbox">
					{options.map((o) => (
						<li key={o.value} role="option" aria-selected={o.value === value}>
							<button
								type="button"
								className={`sortselect__opt${o.value === value ? ' is-active' : ''}`}
								onClick={() => {
									onChange(o.value);
									setOpen(false);
								}}
							>
								<span>{o.label}</span>
								{o.value === value && <Check />}
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
};

export default SortSelect;
