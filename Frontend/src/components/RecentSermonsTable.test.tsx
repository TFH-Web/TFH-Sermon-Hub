// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { makeSermon } from '$/test/makeSermon';
import {
	restoreTimeZoneAfterEach,
	setTimeZone,
	ZONES,
} from '$/test/timeZones';
import RecentSermonsTable from './RecentSermonsTable';

restoreTimeZoneAfterEach();
afterEach(cleanup);

describe('RecentSermonsTable', () => {
	// The first and last days of a year are the ones a zone shift moves into the neighboring year.
	it.each(ZONES)('shows the saved month and day in %s', zone => {
		setTimeZone(zone);
		const sermons = [
			makeSermon({ id: 1, title: 'Spring', date: '2026-04-19' }),
			makeSermon({ id: 2, title: 'New Year', date: '2026-01-01' }),
			makeSermon({ id: 3, title: 'Year End', date: '2026-12-31' }),
		];
		const { container } = render(<RecentSermonsTable sermons={sermons} />);

		// Speaker, series, date and status are the cells after each row's title.
		const dates = Array.from(
			container.querySelectorAll('tbody tr'),
			row => row.querySelectorAll('td')[2]?.textContent,
		);
		expect(dates).toEqual(['Apr 19', 'Jan 1', 'Dec 31']);
	});
});
