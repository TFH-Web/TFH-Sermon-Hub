import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import {
	CalendarDate,
	formatCalendarDate,
	formatCalendarDateString,
	formatDateRange,
	parseCalendarDate,
	toCalendarDateString,
} from './date';

// Behind UTC, ahead of UTC, and the furthest-ahead zone (UTC+14).
const ZONES = [
	'America/Los_Angeles',
	'UTC',
	'Asia/Kolkata',
	'Pacific/Auckland',
	'Pacific/Kiritimati',
];

const originalTZ = process.env.TZ;
afterEach(() => {
	if (originalTZ === undefined) delete process.env.TZ;
	else process.env.TZ = originalTZ;
});

describe('calendar dates', () => {
	it.each(ZONES)('keeps the same day in %s', zone => {
		process.env.TZ = zone;
		const date = CalendarDate.parse('2026-04-19');
		expect(toCalendarDateString(date)).toBe('2026-04-19');
		expect(formatCalendarDate(date)).toBe('Apr 19, 2026');
		expect(formatCalendarDate(date, 'long')).toBe('April 19, 2026');
		expect(formatCalendarDate(date, 'monthDay')).toBe('Apr 19');
	});

	it.each(ZONES)('keeps the first and last day of a year in %s', zone => {
		process.env.TZ = zone;
		expect(formatCalendarDateString('2026-01-01')).toBe('Jan 1, 2026');
		expect(formatCalendarDateString('2026-12-31')).toBe('Dec 31, 2026');
	});

	it('accepts a leap day only in a leap year', () => {
		expect(toCalendarDateString(parseCalendarDate('2024-02-29') as Date)).toBe(
			'2024-02-29',
		);
		expect(toCalendarDateString(parseCalendarDate('2000-02-29') as Date)).toBe(
			'2000-02-29',
		);
		expect(parseCalendarDate('2025-02-29')).toBeNull();
		expect(parseCalendarDate('2100-02-29')).toBeNull();
	});

	it.each([
		'',
		'not a date',
		'2026-4-9',
		'04/19/2026',
		'2026-04-19T00:00:00Z',
		'2026-13-01',
		'2026-00-10',
		'2026-04-31',
		'2026-04-00',
	])('rejects %j', value => {
		expect(parseCalendarDate(value)).toBeNull();
		expect(CalendarDate.safeParse(value).success).toBe(false);
	});

	it('shows invalid strings as they came instead of throwing', () => {
		expect(formatCalendarDateString('Feb 23, 2026')).toBe('Feb 23, 2026');
		expect(formatCalendarDateString('')).toBe('');
	});

	it('rejects values that are not dates', () => {
		expect(CalendarDate.safeParse(null).success).toBe(false);
		expect(CalendarDate.safeParse(20260419).success).toBe(false);
		expect(CalendarDate.safeParse(new Date('invalid')).success).toBe(false);
	});

	// Timestamps (processedAt, lastActive) are exact moments, so they are not turned into calendar dates.
	it('leaves a Date that is already a moment in time unchanged', () => {
		const moment = new Date('2026-04-19T23:30:00Z');
		expect(CalendarDate.parse(moment).getTime()).toBe(moment.getTime());
	});
});

describe('formatDateRange', () => {
	it('shows both dates when both are given', () => {
		expect(formatDateRange('2026-09-01', '2026-09-30')).toBe(
			'Sep 1, 2026 – Sep 30, 2026',
		);
	});

	it('shows the year on each side when the range crosses one', () => {
		expect(formatDateRange('2025-12-28', '2026-01-04')).toBe(
			'Dec 28, 2025 – Jan 4, 2026',
		);
	});

	it('describes a range with only a start', () => {
		expect(formatDateRange('2026-09-01', '')).toBe('From Sep 1, 2026');
	});

	it('describes a range with only an end', () => {
		expect(formatDateRange('', '2026-09-30')).toBe('Up to Sep 30, 2026');
	});

	it('says "All dates" when neither is given', () => {
		expect(formatDateRange('', '')).toBe('All dates');
	});

	// Read in a time zone behind UTC, midnight on the 1st is still the last day of the month before.
	it('does not slip back a day on the first of a month', () => {
		expect(formatDateRange('2026-03-01', '')).toBe('From Mar 1, 2026');
	});
});
