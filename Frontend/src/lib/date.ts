export function formatDate(
	date: Date,
	options: Intl.DateTimeFormatOptions | undefined,
): string {
	const formatter = new Intl.DateTimeFormat('en-US', options);
	return formatter.format(date);
}
