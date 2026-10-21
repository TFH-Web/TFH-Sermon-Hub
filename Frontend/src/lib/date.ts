import z from 'zod';

export function formatDate(
	date: Date,
	options: Intl.DateTimeFormatOptions | undefined,
): string {
	const formatter = new Intl.DateTimeFormat('en-US', options);
	return formatter.format(date);
}

// Sermon dates are calendar dates (YYYY-MM-DD) with no time or zone. They are kept as a Date at local
// midnight and read with local fields, so the day is the same in every time zone. Parsing "2026-04-19"
// with new Date() would give midnight UTC instead, which is the previous day for anyone behind UTC.
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Read a YYYY-MM-DD string as a local calendar date. Returns null if it is malformed or not a real day. */
export function parseCalendarDate(value: string): Date | null {
	const match = CALENDAR_DATE.exec(value);
	if (!match) return null;
	const [year, month, day] = [
		Number(match[1]),
		Number(match[2]),
		Number(match[3]),
	];
	// Date.setFullYear is used so years below 100 are not shifted to 19xx.
	const date = new Date(2000, 0, 1);
	date.setFullYear(year, month - 1, day);
	// An overflowing day (Feb 30, month 13) rolls into the next month, so check the parts survived.
	const isReal =
		date.getFullYear() === year &&
		date.getMonth() === month - 1 &&
		date.getDate() === day;
	return isReal ? date : null;
}

/** Write a local calendar date as YYYY-MM-DD. Not toISOString(), which converts to UTC and can change the day. */
export function toCalendarDateString(date: Date): string {
	const pad = (n: number, length: number) => String(n).padStart(length, '0');
	return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

/** Parses a sermon's date. Date objects pass through; strings must be YYYY-MM-DD. */
export const CalendarDate = z
	.union([z.date(), z.string()])
	.transform((value, ctx) => {
		if (value instanceof Date) return value;
		const date = parseCalendarDate(value);
		if (!date) {
			ctx.issues.push({
				code: 'custom',
				message: 'Expected a date as YYYY-MM-DD',
				input: value,
			});
			return z.NEVER;
		}
		return date;
	});

const CALENDAR_FORMATS = {
	short: { month: 'short', day: 'numeric', year: 'numeric' },
	long: { month: 'long', day: 'numeric', year: 'numeric' },
	monthDay: { month: 'short', day: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

/** Show a calendar date for display, e.g. "Apr 19, 2026". Uses local fields, matching how it was parsed. */
export function formatCalendarDate(
	date: Date,
	style: keyof typeof CALENDAR_FORMATS = 'short',
): string {
	return formatDate(date, CALENDAR_FORMATS[style]);
}

/** Like formatCalendarDate for a YYYY-MM-DD string. Anything that is not one is shown as it came. */
export function formatCalendarDateString(
	value: string,
	style: keyof typeof CALENDAR_FORMATS = 'short',
): string {
	const date = parseCalendarDate(value);
	return date ? formatCalendarDate(date, style) : value;
}

/** Describe a range of YYYY-MM-DD dates, e.g. "Sep 1, 2026 – Sep 30, 2026". Either end may be empty. */
export function formatDateRange(from: string, to: string): string {
	if (from && to)
		return `${formatCalendarDateString(from)} – ${formatCalendarDateString(to)}`;
	if (from) return `From ${formatCalendarDateString(from)}`;
	if (to) return `Up to ${formatCalendarDateString(to)}`;
	return 'All dates';
}
