import { describe, expect, it } from 'vitest';
import { formatDateRange, parseUtcTimestamp } from './date';

describe('parseUtcTimestamp', () => {
	// The server sends UTC with no zone suffix, which a bare Date would read as local time.
	it('reads a timestamp with no zone as UTC', () => {
		expect(parseUtcTimestamp('2026-10-20T06:49:24.744828').toISOString()).toBe(
			'2026-10-20T06:49:24.744Z',
		);
	});

	it('keeps the zone a timestamp already has', () => {
		expect(parseUtcTimestamp('2026-10-20T06:49:24Z').toISOString()).toBe(
			'2026-10-20T06:49:24.000Z',
		);
		expect(parseUtcTimestamp('2026-10-20T06:49:24+02:00').toISOString()).toBe(
			'2026-10-20T04:49:24.000Z',
		);
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
