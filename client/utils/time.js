// Compact relative-time label ("just now", "5m", "3h", "2d") for notification
// timestamps. Falls back to a short date past a week.
export const timeAgo = (iso) => {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return '';

	const secs = Math.round((Date.now() - then) / 1000);
	if (secs < 45) return 'just now';
	const mins = Math.round(secs / 60);
	if (mins < 60) return `${mins}m`;
	const hrs = Math.round(mins / 60);
	if (hrs < 24) return `${hrs}h`;
	const days = Math.round(hrs / 24);
	if (days < 7) return `${days}d`;

	return new Date(then).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
	});
};
