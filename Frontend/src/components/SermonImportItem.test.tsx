// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeSermon } from '$/test/makeSermon';
import {
	restoreTimeZoneAfterEach,
	setTimeZone,
	ZONES,
} from '$/test/timeZones';
import SermonImportItem from './SermonImportItem';

// The row icon is not under test, and the real one renders asynchronously.
vi.mock('@iconify-icon/react', () => ({ Icon: () => null }));

restoreTimeZoneAfterEach();
afterEach(cleanup);

describe('SermonImportItem', () => {
	// A row that has not failed needs no query client or signed-in user, so it renders on its own.
	it.each(ZONES)('shows the saved day in %s', zone => {
		setTimeZone(zone);
		const { container } = render(
			<SermonImportItem sermon={makeSermon({ date: '2026-03-01' })} />,
		);

		expect(container.querySelector('.ImportItem-subtitle')?.textContent).toBe(
			'Dave Patterson • Mar 1, 2026',
		);
	});
});
