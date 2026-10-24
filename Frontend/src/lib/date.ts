export function formatDate(
	date: Date,
	options: Intl.DateTimeFormatOptions | undefined,
): string {
	const formatter = new Intl.DateTimeFormat('en-US', options);
	return formatter.format(date);
}

/** Read a timestamp the server sent as UTC without a zone suffix, e.g. "2026-10-20T06:49:24.744828". A bare one would be read as local time. */
export function parseUtcTimestamp(value: string): Date {
	return new Date(/(?:Z|[+-]\d\d:?\d\d)$/i.test(value) ? value : `${value}Z`);
}

/** Show a timestamp the server sent as UTC in the viewer's own time zone, e.g. "Oct 20, 2026, 6:49 AM". */
export function formatTimestamp(value: string): string {
	return formatDate(parseUtcTimestamp(value), {
		dateStyle: 'medium',
		timeStyle: 'short',
	});
}

/** Describe a range of YYYY-MM-DD dates, e.g. "Sep 1, 2026 – Sep 30, 2026". Either end may be empty. */
export function formatDateRange(from: string, to: string): string {
	// A date with no time is read as midnight UTC, so format in UTC or the day can slip back one.
	const format = (value: string) =>
		formatDate(new Date(value), {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC',
		});

	if (from && to) return `${format(from)} – ${format(to)}`;
	if (from) return `From ${format(from)}`;
	if (to) return `Up to ${format(to)}`;
	return 'All dates';
}
