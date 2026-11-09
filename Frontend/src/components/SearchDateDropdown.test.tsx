// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SearchDateDropdown from './SearchDateDropdown';

afterEach(cleanup);

const CUSTOM = 'custom|2026-01-01|2026-02-01';

function renderDropdown(value = 'any') {
	const onChange = vi.fn();
	const view = render(<SearchDateDropdown value={value} onChange={onChange} />);
	return { ...view, onChange };
}

// The trigger and the "All dates" option can share a name, so find the trigger by its class.
function trigger(container: HTMLElement) {
	return container.querySelector(
		'.SearchDateDropdown-trigger',
	) as HTMLButtonElement;
}

function open(container: HTMLElement) {
	fireEvent.click(trigger(container));
}

// Only the options inside the open panel: the trigger button can carry the same text.
function optionButton(label: string) {
	const panel = document.querySelector(
		'.SearchDateDropdown-panel',
	) as HTMLElement;
	return within(panel).getByRole('button', { name: label });
}

function startInput() {
	return screen.getByLabelText('Start date') as HTMLInputElement;
}

function endInput() {
	return screen.getByLabelText('End date') as HTMLInputElement;
}

function pickDate(input: HTMLInputElement, date: string) {
	fireEvent.change(input, { target: { value: date } });
}

describe('SearchDateDropdown trigger label', () => {
	it.each([
		['any', 'All dates'],
		['24h', '24 Hours'],
		['7d', '7 Days'],
		['14d', '14 Days'],
		['28d', '28 Days'],
		['1y', '1 Year'],
		[CUSTOM, 'Custom range'],
		['something-else', 'All dates'],
	])('shows the label for %s', (value, label) => {
		const { container } = renderDropdown(value);

		expect(trigger(container).textContent).toContain(label);
	});

	it('shows All dates for a custom value with only one end of the range', () => {
		const { container } = renderDropdown('custom|2026-01-01|');

		expect(trigger(container).textContent).toContain('All dates');
	});
});

describe('SearchDateDropdown presets', () => {
	it('opens and closes the panel from the trigger', () => {
		const { container } = renderDropdown();
		expect(trigger(container).getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByLabelText('Start date')).toBeNull();

		open(container);
		expect(trigger(container).getAttribute('aria-expanded')).toBe('true');
		expect(startInput()).toBeTruthy();

		open(container);
		expect(trigger(container).getAttribute('aria-expanded')).toBe('false');
	});

	it('reports a chosen preset and closes the panel', () => {
		const { container, onChange } = renderDropdown();
		open(container);

		fireEvent.click(optionButton('7 Days'));

		expect(onChange).toHaveBeenCalledExactlyOnceWith('7d');
		expect(trigger(container).getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByLabelText('Start date')).toBeNull();
	});

	it('puts a check mark on the active preset only', () => {
		const { container } = renderDropdown('7d');
		open(container);

		expect(optionButton('7 Days').textContent).toContain('✓');
		expect(optionButton('14 Days').textContent).not.toContain('✓');
		expect(optionButton('All dates').textContent).not.toContain('✓');
	});

	it('clears the date inputs when a preset is chosen over a custom range', () => {
		const { container, onChange } = renderDropdown(CUSTOM);
		open(container);
		expect(startInput().value).toBe('2026-01-01');

		fireEvent.click(optionButton('All dates'));

		expect(onChange).toHaveBeenCalledWith('any');
		open(container);
		expect(startInput().value).toBe('');
		expect(endInput().value).toBe('');
	});
});

describe('SearchDateDropdown custom range', () => {
	it('reports a custom range once both dates are chosen', () => {
		const { container, onChange } = renderDropdown();
		open(container);

		pickDate(startInput(), '2026-01-01');
		pickDate(endInput(), '2026-02-01');

		expect(onChange).toHaveBeenLastCalledWith(CUSTOM);
	});

	it('treats a single date as no date filter', () => {
		const { container, onChange } = renderDropdown();
		open(container);

		pickDate(startInput(), '2026-01-01');

		expect(onChange).toHaveBeenCalledExactlyOnceWith('any');
		expect(trigger(container).textContent).toContain('All dates');
	});

	it('treats a start date after the end date as no date filter', () => {
		const { container, onChange } = renderDropdown();
		open(container);

		pickDate(startInput(), '2026-03-01');
		pickDate(endInput(), '2026-02-01');

		expect(onChange).toHaveBeenLastCalledWith('any');
		expect(trigger(container).textContent).toContain('All dates');
	});

	it('accepts a range that starts and ends on the same day', () => {
		const { container, onChange } = renderDropdown();
		open(container);

		pickDate(startInput(), '2026-02-01');
		pickDate(endInput(), '2026-02-01');

		expect(onChange).toHaveBeenLastCalledWith('custom|2026-02-01|2026-02-01');
	});

	it('goes back to no filter when a date is cleared', () => {
		const { container, onChange } = renderDropdown();
		open(container);
		pickDate(startInput(), '2026-01-01');
		pickDate(endInput(), '2026-02-01');

		pickDate(endInput(), '');
		expect(onChange).toHaveBeenLastCalledWith('any');

		pickDate(startInput(), '');
		expect(onChange).toHaveBeenLastCalledWith('any');
	});

	it('fills the inputs from a custom value and shows no preset check mark', () => {
		const { container } = renderDropdown(CUSTOM);
		open(container);

		expect(startInput().value).toBe('2026-01-01');
		expect(endInput().value).toBe('2026-02-01');
		expect(screen.queryByText('✓')).toBeNull();
		for (const label of ['All dates', '24 Hours', '7 Days', '1 Year']) {
			expect(optionButton(label).textContent).not.toContain('✓');
		}
	});

	it('shows only the known end of a partial custom value, with no check mark', () => {
		const { container } = renderDropdown('custom|2026-01-01|');
		open(container);

		expect(startInput().value).toBe('2026-01-01');
		expect(endInput().value).toBe('');
		expect(optionButton('All dates').textContent).not.toContain('✓');
	});

	it('empties the inputs when the value changes from a custom range to a preset', () => {
		const onChange = vi.fn();
		const { container, rerender } = render(
			<SearchDateDropdown value={CUSTOM} onChange={onChange} />,
		);
		open(container);
		expect(startInput().value).toBe('2026-01-01');

		rerender(<SearchDateDropdown value="7d" onChange={onChange} />);

		expect(startInput().value).toBe('');
		expect(endInput().value).toBe('');
	});
});

describe('SearchDateDropdown outside clicks', () => {
	it('closes the panel on a mouse press outside it', () => {
		const { container } = renderDropdown();
		open(container);

		fireEvent.mouseDown(document.body);

		expect(trigger(container).getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByLabelText('Start date')).toBeNull();
	});

	it('keeps the panel open on a mouse press inside it', () => {
		const { container } = renderDropdown();
		open(container);

		fireEvent.mouseDown(startInput());

		expect(trigger(container).getAttribute('aria-expanded')).toBe('true');
		expect(startInput()).toBeTruthy();
	});
});
