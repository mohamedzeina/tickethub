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

export const CalendarIcon = (props) => (
	<svg {...base} {...props}>
		<rect x="3" y="4" width="18" height="18" rx="2" />
		<path d="M16 2v4M8 2v4M3 10h18" />
	</svg>
);

export const LocationIcon = (props) => (
	<svg {...base} {...props}>
		<path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
		<circle cx="12" cy="10" r="2.5" />
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

export const Alert = (props) => (
	<svg {...base} strokeWidth={2} {...props}>
		<circle cx="12" cy="12" r="9" />
		<path d="M12 7v5M12 16h.01" />
	</svg>
);
