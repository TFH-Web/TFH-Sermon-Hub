export function formatDate(
	date: Date,
	options: Intl.DateTimeFormatOptions | undefined,
): string {
	const formatter = new Intl.DateTimeFormat('en-US', options);
	return formatter.format(date);
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
