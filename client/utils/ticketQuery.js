// Shared between the landing page, the /search page, and the filter bar so the
// list of categories and sort options lives in exactly one place. CATEGORIES
// mirrors TICKET_CATEGORIES in the tickets service model.
export const CATEGORIES = ['Concerts', 'Sports', 'Theater', 'Festivals', 'Other'];

export const SORTS = [
	{ value: 'newest', label: 'Newest' },
	{ value: 'price_asc', label: 'Price · Low to High' },
	{ value: 'price_desc', label: 'Price · High to Low' },
	{ value: 'date_asc', label: 'Event Date · Soonest' },
];

const SORT_VALUES = SORTS.map((s) => s.value);

// Turn a raw URL query into the clean UI filters plus the query string we hand to
// the tickets API. That API validates strictly and 400s on anything unexpected,
// so a hand-edited or stale link (e.g. ?category=boooga) would otherwise crash
// the page — we drop values it would reject and just browse on. Prices must be
// non-negative numbers and page a positive integer.
export const parseTicketQuery = (query) => {
	const { q, category, minPrice, maxPrice, sort, page } = query;
	const str = (v) => (typeof v === 'string' ? v : '');
	const num = (v) => {
		const n = Number(v);
		return str(v) !== '' && Number.isFinite(n) && n >= 0 ? String(n) : '';
	};

	const filters = {
		q: str(q),
		category: CATEGORIES.includes(category) ? category : '',
		minPrice: num(minPrice),
		maxPrice: num(maxPrice),
		sort: SORT_VALUES.includes(sort) ? sort : 'newest',
	};

	const pageNum = Number(page);
	const cleanPage =
		Number.isInteger(pageNum) && pageNum >= 1 ? String(pageNum) : '';

	const params = new URLSearchParams();
	if (filters.q) params.set('q', filters.q);
	if (filters.category) params.set('category', filters.category);
	if (filters.minPrice) params.set('minPrice', filters.minPrice);
	if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
	if (filters.sort !== 'newest') params.set('sort', filters.sort);
	if (cleanPage) params.set('page', cleanPage);

	return { filters, qs: params.toString() };
};
