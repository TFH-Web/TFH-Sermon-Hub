// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import Settings from './Settings';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('$/components/MainLayout', () => ({
	default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('$/components/ToastContext', () => ({
	useToast: () => ({ showToast }),
}));

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	showToast.mockClear();
});

it('shows unavailable storage without invented numbers, a progress meter, or backup actions', async () => {
	const get = vi
		.spyOn(axios, 'get')
		.mockRejectedValue(new Error('No API expected'));
	const fetch = vi
		.spyOn(globalThis, 'fetch')
		.mockRejectedValue(new Error('No API expected'));
	render(
		<MemoryRouter>
			<Settings />
		</MemoryRouter>,
	);
	await userEvent.click(screen.getByRole('button', { name: 'Backup' }));
	const heading = screen.getByRole('heading', {
		name: 'Hosting & Infrastructure',
	});
	const hosting = heading.closest<HTMLElement>('.Card');
	if (!hosting) throw new Error('Missing hosting card');
	expect(within(hosting).getByText('Unavailable')).toBeTruthy();
	expect(
		within(hosting).getByText('Storage usage is not available in this app.'),
	).toBeTruthy();
	expect(within(hosting).queryByRole('progressbar')).toBeNull();
	expect(hosting.textContent).not.toMatch(/NaN|Infinity|%|\bGB\b/);
	expect(screen.queryByRole('button', { name: /Save|Run Now/ })).toBeNull();
	for (const input of screen.getAllByRole('textbox'))
		expect(input).toHaveProperty('readOnly', true);
	expect(get).not.toHaveBeenCalled();
	expect(fetch).not.toHaveBeenCalled();
	expect(showToast).not.toHaveBeenCalled();
});
