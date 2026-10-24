// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeSermon } from '$/test/makeSermon';
import { restoreTimeZoneAfterEach, setTimeZone, ZONES } from '$/test/timeZones';
import EditSermonModal from './EditSermonModal';

vi.mock('$/components/ToastContext', () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

restoreTimeZoneAfterEach();
afterEach(cleanup);

describe('EditSermonModal', () => {
	it.each(ZONES)('fills the date field with the saved day in %s', zone => {
		setTimeZone(zone);
		const { container } = render(
			<EditSermonModal
				isOpen
				onClose={vi.fn()}
				sermon={makeSermon({ date: '2026-03-01' })}
			/>,
		);

		// FormField labels are not linked to their inputs, so the field is found by its type.
		const date =
			container.querySelector<HTMLInputElement>('input[type="date"]');
		expect(date?.value).toBe('2026-03-01');
	});
});
