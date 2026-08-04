// Shared line icons used across the "Admit One" UI. All inherit currentColor
// and a 1.8 stroke so they sit consistently against the ticket-stock surfaces.
const base = {
	viewBox: '0 0 24 24',
	fill: 'none',
	stroke: 'currentColor',
	strokeWidth: 1.8,
	strokeLinecap: 'round',
	strokeLinejoin: 'round',
	'aria-hidden': true,
};

export const SearchIcon = (props) => (
	<svg {...base} strokeWidth={2} {...props}>
		<circle cx="11" cy="11" r="7" />
		<path d="m21 21-4.3-4.3" />
	</svg>
);

export const ArrowRight = (props) => (
	<svg {...base} strokeWidth={2} {...props}>
		<path d="M5 12h14M13 6l6 6-6 6" />
	</svg>
);

export const ArrowLeft = (props) => (
	<svg {...base} strokeWidth={2} {...props}>
		<path d="M19 12H5M11 18l-6-6 6-6" />
	</svg>
);

export const Bolt = (props) => (
	<svg {...base} strokeWidth={2} {...props}>
		<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
	</svg>
);

export const Check = (props) => (
	<svg {...base} strokeWidth={2} {...props}>
		<path d="M20 6 9 17l-5-5" />
	</svg>
);

export const ChevronDown = (props) => (
	<svg {...base} strokeWidth={2} {...props}>
		<path d="m6 9 6 6 6-6" />
	</svg>
);

export const Plus = (props) => (
	<svg {...base} strokeWidth={2} {...props}>
		<path d="M12 5v14M5 12h14" />
	</svg>
);

export const Upload = (props) => (
	<svg {...base} {...props}>
		<path d="M12 16V4M7 9l5-5 5 5" />
		<path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
	</svg>
);

export const Bell = (props) => (
	<svg {...base} {...props}>
		<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
		<path d="M13.7 21a2 2 0 0 1-3.4 0" />
	</svg>
);

// Gate scanner glyphs (#delivery). Heavier strokes and their own default sizes
// than the browse icons — they're read at arm's length on an operator's phone.
export const IconCamera = (props) => (
	<svg {...base} width="16" height="16" {...props}>
		<path d="M3 7h3l1.5-2h9L18 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
		<circle cx="12" cy="13" r="3.5" />
	</svg>
);

export const IconCheck = (props) => (
	<svg {...base} width="22" height="22" strokeWidth={2.2} {...props}>
		<circle cx="12" cy="12" r="9" />
		<path d="m8.5 12 2.5 2.5 4.5-5" />
	</svg>
);

export const IconX = (props) => (
	<svg {...base} width="22" height="22" strokeWidth={2.2} {...props}>
		<circle cx="12" cy="12" r="9" />
		<path d="m9 9 6 6m0-6-6 6" />
	</svg>
);

export const IconBack = (props) => (
	<svg {...base} strokeWidth={2} {...props}>
		<path d="m15 18-6-6 6-6" />
	</svg>
);

// Star for seller ratings (#9). `filled` paints the body in currentColor;
// otherwise it's an outline, so the same glyph renders both states identically.
export const Star = ({ filled, ...props }) => (
	<svg {...base} fill={filled ? 'currentColor' : 'none'} {...props}>
		<path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.94 6.2 20.98l1.1-6.47L2.6 9.45l6.5-.95L12 2.6Z" />
	</svg>
);

// Heart for the wishlist (#16). `filled` paints it solid (saved); otherwise an
// outline, so the same glyph covers both states.
export const Heart = ({ filled, ...props }) => (
	<svg {...base} fill={filled ? 'currentColor' : 'none'} {...props}>
		<path d="M12 20.5l-1.45-1.32C5.4 14.5 2.5 11.86 2.5 8.5 2.5 6.02 4.42 4 6.9 4c1.4 0 2.74.65 3.6 1.68L12 7.5l1.5-1.82A4.74 4.74 0 0 1 17.1 4C19.58 4 21.5 6.02 21.5 8.5c0 3.36-2.9 6-8.05 10.68L12 20.5Z" />
	</svg>
);
