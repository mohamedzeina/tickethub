import { useEffect, useState } from 'react';
import { CATEGORIES, SORTS } from '../utils/ticketQuery';
import SortSelect from './SortSelect';

// Category chips + price range + sort. Presentational: the parent owns the URL
// and decides what an update means (onApplyPrice also scrolls to the results).
const FilterBar = ({ filters, onUpdate, onApplyPrice }) => {
	const [minPrice, setMinPrice] = useState(filters.minPrice);
	const [maxPrice, setMaxPrice] = useState(filters.maxPrice);

	// Keep inputs in sync when navigation (incl. back/forward) changes filters.
	useEffect(() => setMinPrice(filters.minPrice), [filters.minPrice]);
	useEffect(() => setMaxPrice(filters.maxPrice), [filters.maxPrice]);

	const submitPrice = (e) => {
		e.preventDefault();
		onApplyPrice({ minPrice: minPrice.trim(), maxPrice: maxPrice.trim() });
	};

	return (
		<div className="filterbar">
			<div className="chips" role="group" aria-label="Filter by category">
				<button
					type="button"
					className={`chip${!filters.category ? ' is-active' : ''}`}
					onClick={() => onUpdate({ category: undefined })}
				>
					All
				</button>
				{CATEGORIES.map((c) => (
					<button
						key={c}
						type="button"
						className={`chip${filters.category === c ? ' is-active' : ''}`}
						onClick={() =>
							onUpdate({ category: filters.category === c ? undefined : c })
						}
					>
						{c}
					</button>
				))}
			</div>

			<div className="filterbar__tools">
				<form className="pricefilter" onSubmit={submitPrice}>
					<input
						type="number"
						min="0"
						inputMode="numeric"
						value={minPrice}
						onChange={(e) => setMinPrice(e.target.value)}
						placeholder="Min $"
						aria-label="Minimum price"
					/>
					<span aria-hidden="true">–</span>
					<input
						type="number"
						min="0"
						inputMode="numeric"
						value={maxPrice}
						onChange={(e) => setMaxPrice(e.target.value)}
						placeholder="Max $"
						aria-label="Maximum price"
					/>
					<button type="submit" className="btn btn--counter">
						Apply
					</button>
				</form>

				<div className="sortfield">
					<span>Sort</span>
					<SortSelect
						value={filters.sort}
						options={SORTS}
						onChange={(sort) => onUpdate({ sort })}
					/>
				</div>
			</div>
		</div>
	);
};

export default FilterBar;
