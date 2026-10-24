// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeSermon } from '$/test/makeSermon';
import {
	restoreTimeZoneAfterEach,
	setTimeZone,
	ZONES,
} from '$/test/timeZones';
import SermonCard from './SermonCard';

// The status icon is not under test, and the real one renders asynchronously.
vi.mock('@iconify-icon/react', () => ({ Icon: () => null }));

restoreTimeZoneAfterEach();
afterEach(cleanup);

describe('SermonCard', () => {
	it.each(ZONES)('shows the saved day in %s', zone => {
		setTimeZone(zone);
		const { container } = render(<SermonCard sermon={makeSermon()} />);

		const date = container.querySelector('.SermonCard-date');
		expect(date?.textContent).toBe('Apr 19, 2026');
		expect(date?.getAttribute('datetime')).toBe('2026-04-19');
	});

	// Read as midnight UTC, the 1st of a month is still the last day of the month before in the Americas.
	it.each(ZONES)('keeps the first of a month in %s', zone => {
		setTimeZone(zone);
		const { container } = render(
			<SermonCard sermon={makeSermon({ date: '2026-03-01' })} />,
		);

		const date = container.querySelector('.SermonCard-date');
		expect(date?.textContent).toBe('Mar 1, 2026');
		expect(date?.getAttribute('datetime')).toBe('2026-03-01');
	});

	it('labels only saved AI tags', () => {
		const sermon = makeSermon({
			tags: [
				{ name: 'grace', source: 'ai' },
				{ name: 'faith', source: 'manual' },
			],
		});
		const { container } = render(<SermonCard sermon={sermon} />);

		const tags = Array.from(
			container.querySelectorAll('.SermonCard-tags > *'),
			tag => tag.textContent,
		);
		expect(tags).toEqual(['grace · AI Generated', 'faith']);
	});

	it('shows no label when a sermon has no tags', () => {
		const { container } = render(<SermonCard sermon={makeSermon()} />);

		expect(container.querySelectorAll('.SermonCard-tags > *')).toHaveLength(0);
		expect(container.textContent).not.toContain('AI Generated');
	});
});
