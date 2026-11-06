// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios, { type AxiosAdapter, AxiosError } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Speakers from './Speakers';

vi.mock('@iconify-icon/react', () => ({ Icon: () => null }));
// The real layout brings in the sidebar and MSAL, none of which this page needs.
vi.mock('$/components/MainLayout', () => ({
	default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const originalAdapter = axios.defaults.adapter;
const adapter = vi.fn<AxiosAdapter>();
let queryClient: QueryClient;

// What the fake server knows. Tests may change these before rendering.
let items: unknown[];
let totalPages: number;
let failing: boolean;

beforeEach(() => {
	failing = false;
	totalPages = 1;
	items = [
		{
			id: 1,
			firstName: 'Dave',
			lastName: 'Patterson',
			role: 'Lead Speaker',
			sermonCount: 3,
		},
		{ id: 2, firstName: 'Jake', lastName: 'Taylor', sermonCount: 1 },
		{ id: 3, firstName: 'Mary', lastName: 'Jones', role: '', sermonCount: 0 },
	];
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	adapter.mockReset();
	adapter.mockImplementation(async config => {
		const response = {
			data: {
				items,
				page: config.params.page,
				pageSize: 10,
				total: items.length,
				totalPages,
			},
			status: failing ? 500 : 200,
			statusText: '',
			headers: {},
			config,
		};
		if (failing) {
			throw new AxiosError(
				'Request failed',
				'ERR_BAD_RESPONSE',
				config,
				undefined,
				response,
			);
		}
		return response;
	});
	axios.defaults.adapter = adapter;
});

afterEach(() => {
	cleanup();
	queryClient.clear();
	axios.defaults.adapter = originalAdapter;
});

function renderPage() {
	return render(
		<QueryClientProvider client={queryClient}>
			<Speakers />
		</QueryClientProvider>,
	);
}

function lastParams() {
	return adapter.mock.calls.at(-1)?.[0].params;
}

describe('Speakers page', () => {
	it('shows loading, then a card per speaker with initials, role and sermon count', async () => {
		const { container } = renderPage();
		expect(screen.getByText('Loading...')).toBeTruthy();

		await screen.findByText('Dave Patterson');

		const cards = Array.from(container.querySelectorAll('.speaker-card')).map(
			card => ({
				initials: card.querySelector('.speaker-icon')?.textContent,
				name: card.querySelector('.speaker-name')?.textContent,
				info: card.querySelector('.speaker-info')?.textContent,
			}),
		);
		expect(cards).toEqual([
			{
				initials: 'DP',
				name: 'Dave Patterson',
				info: 'Lead Speaker • 3 sermons',
			},
			// No role, or an empty one, falls back to a placeholder; one sermon is singular.
			{
				initials: 'JT',
				name: 'Jake Taylor',
				info: 'Unspecified Role • 1 sermon',
			},
			{
				initials: 'MJ',
				name: 'Mary Jones',
				info: 'Unspecified Role • 0 sermons',
			},
		]);
		expect(screen.queryByText('Loading...')).toBeNull();
	});

	it('asks for the first page of ten, in the default order', async () => {
		renderPage();
		await screen.findByText('Dave Patterson');

		expect(adapter).toHaveBeenCalledOnce();
		const config = adapter.mock.calls[0][0];
		expect(config.url).toBe('/api/speakers');
		expect(config.params).toEqual({ page: 1, pageSize: 10, sort: 'Default' });
	});

	it('moves to the next page', async () => {
		totalPages = 2;
		const user = userEvent.setup();
		renderPage();
		await screen.findByText('Page 1 of 2');

		await user.click(screen.getByRole('button', { name: 'Next page' }));

		await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));
		await screen.findByText('Page 2 of 2');
	});

	it('sorts, and goes back to page 1 when the order changes', async () => {
		totalPages = 2;
		const user = userEvent.setup();
		renderPage();
		await screen.findByText('Page 1 of 2');
		await user.click(screen.getByRole('button', { name: 'Next page' }));
		await screen.findByText('Page 2 of 2');
		expect(
			Array.from(
				(screen.getByRole('combobox') as HTMLSelectElement).options,
			).map(option => option.textContent),
		).toEqual(['Default', 'A-Z', 'Z-A']);

		await user.selectOptions(screen.getByRole('combobox'), 'Z-A');

		await waitFor(() =>
			expect(lastParams()).toEqual({ page: 1, pageSize: 10, sort: 'Z-A' }),
		);
		await screen.findByText('Page 1 of 2');
	});

	it('says so when there are no speakers', async () => {
		items = [];

		const { container } = renderPage();

		await screen.findByText('No speakers match the selected filters.');
		expect(container.querySelectorAll('.speaker-card')).toHaveLength(0);
	});

	it('shows an error, without a Retry button, when the speakers fail to load', async () => {
		failing = true;

		renderPage();

		await screen.findByText(
			'Failed to load speakers. Refresh the page and try again.',
		);
		expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
	});
});
