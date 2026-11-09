// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios, { type AxiosAdapter, AxiosError } from 'axios';
import type { ReactNode } from 'react';
// From react-router-dom, like the page and its cards, so they all share one router instance.
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchApiResult, SearchPage } from '$/hooks/useAISearchRequest';
import AISearch from './AISearch';

vi.mock('@iconify-icon/react', () => ({ Icon: () => null }));
// The real layout brings in the sidebar and MSAL, none of which this page needs.
vi.mock('$/components/MainLayout', () => ({
	default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// The hook merges filters into window.location.search, so use BrowserRouter and set the
// starting address with window.history.replaceState (see useAISearch.test.tsx).
const originalAdapter = axios.defaults.adapter;
const adapter = vi.fn<AxiosAdapter>();
let queryClient: QueryClient;

// What the fake server answers with next, and an optional gate that holds the answer back.
let reply: { status: number; data: unknown };
let gate: Promise<void> | null;

const placeholder = 'e.g. What has Dave said about overcoming anxiety?';

function result(id: number, extra: Partial<SearchApiResult> = {}) {
	return {
		id,
		title: `Sermon ${id}`,
		type: 'sermon',
		speaker: 'Dave Patterson',
		date: '2026-10-15',
		summary: `Summary ${id}`,
		ai_score: 0.5,
		...extra,
	} satisfies SearchApiResult;
}

function envelope(
	items: SearchApiResult[],
	overrides: Partial<SearchPage> = {},
) {
	return {
		items,
		page: 1,
		pageSize: 6,
		total: items.length,
		totalPages: 1,
		...overrides,
	} satisfies SearchPage;
}

function startAt(search: string) {
	window.history.replaceState({}, '', `/ai-search${search}`);
}

function renderPage() {
	return render(
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>
				<AISearch />
			</BrowserRouter>
		</QueryClientProvider>,
	);
}

function lastParams() {
	return adapter.mock.calls.at(-1)?.[0].params;
}

beforeEach(() => {
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	reply = {
		status: 200,
		data: envelope([result(1), result(2)]),
	};
	gate = null;
	adapter.mockReset();
	adapter.mockImplementation(async config => {
		if (gate) {
			await gate;
		}
		const response = {
			data: reply.data,
			status: reply.status,
			statusText: '',
			headers: {},
			config,
		};
		if (reply.status >= 400) {
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
	startAt('');
});

afterEach(() => {
	cleanup();
	queryClient.clear();
	axios.defaults.adapter = originalAdapter;
	window.history.replaceState({}, '', '/');
});

describe('AISearch page: searching', () => {
	it('shows no results until the first search, then loading, then the cards', async () => {
		let release: () => void = () => {};
		gate = new Promise<void>(resolve => {
			release = resolve;
		});
		const user = userEvent.setup();
		const { container } = renderPage();
		expect(container.querySelector('.AISearch-results')).toBeNull();
		expect(adapter).not.toHaveBeenCalled();

		await user.type(screen.getByPlaceholderText(placeholder), 'grace');
		await user.click(screen.getByRole('button', { name: 'Search' }));

		await screen.findByRole('status');
		release();
		await screen.findByText('2 results');
		expect(
			container.querySelector('.AISearch-resultsMeta')?.textContent,
		).toContain('Found 2 results for "grace"');
		expect(screen.getAllByRole('article')).toHaveLength(2);
		expect(lastParams()).toMatchObject({ q: 'grace' });
	});

	it('restores the search from the address', async () => {
		startAt('?q=hope&type=sermon&page=2');

		renderPage();

		expect(
			(screen.getByPlaceholderText(placeholder) as HTMLInputElement).value,
		).toBe('hope');
		expect(screen.getByRole('button', { name: 'Sermons' }).className).toContain(
			'SearchFilters-pill--active',
		);
		expect(screen.getByRole('button', { name: 'All' }).className).not.toContain(
			'SearchFilters-pill--active',
		);
		await screen.findByText('2 results');
		expect(lastParams()).toEqual({
			q: 'hope',
			type: 'sermon',
			speaker: 'any',
			date: 'any',
			page: 2,
			pageSize: 6,
		});
	});

	it('says so when nothing matches and disables both page buttons', async () => {
		reply = { status: 200, data: envelope([], { totalPages: 0 }) };
		startAt('?q=nothing');

		renderPage();

		await screen.findByText(
			'No results found. Try another query or change your filters.',
		);
		expect(screen.getByText('Page 0 of 0')).toBeTruthy();
		expect(
			(
				screen.getByRole('button', {
					name: 'Previous page',
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		expect(
			(screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	it('shows an error when the search fails, and Retry searches again', async () => {
		reply = { status: 500, data: {} };
		startAt('?q=hope');
		const user = userEvent.setup();
		renderPage();
		await screen.findByText('Unable to search sermons. Please try again.');
		expect(adapter).toHaveBeenCalledTimes(1);

		reply = { status: 200, data: envelope([result(1), result(2)]) };
		await user.click(screen.getByRole('button', { name: 'Retry' }));

		await screen.findByText('2 results');
		expect(adapter).toHaveBeenCalledTimes(2);
		expect(
			screen.queryByText('Unable to search sermons. Please try again.'),
		).toBeNull();
	});

	it('highlights the query words in a snippet', async () => {
		reply = {
			status: 200,
			data: envelope([result(1, { snippet: 'God shows grace every day' })]),
		};
		startAt('?q=grace');

		const { container } = renderPage();

		await screen.findByText('1 results');
		expect(container.querySelector('mark')?.textContent).toBe('grace');
	});
});

describe('AISearch page: paging and filters', () => {
	it('pages forward through the results and stops at the last page', async () => {
		reply = { status: 200, data: envelope([result(1)], { totalPages: 3 }) };
		startAt('?q=hope');
		const user = userEvent.setup();
		renderPage();
		await screen.findByText('Page 1 of 3');
		const previous = () =>
			screen.getByRole('button', {
				name: 'Previous page',
			}) as HTMLButtonElement;
		const next = () =>
			screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement;
		expect(previous().disabled).toBe(true);
		expect(next().disabled).toBe(false);

		await user.click(next());

		await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));
		expect(new URLSearchParams(window.location.search).get('page')).toBe('2');
		await screen.findByText('Page 2 of 3');
		expect(previous().disabled).toBe(false);
		await user.click(next());
		await screen.findByText('Page 3 of 3');
		expect(next().disabled).toBe(true);
	});

	it('goes back to page 1 when a content type is chosen', async () => {
		startAt('?q=hope&page=2');
		const user = userEvent.setup();
		renderPage();
		await screen.findByText('2 results');

		await user.click(screen.getByRole('button', { name: 'Transcripts' }));

		await waitFor(() =>
			expect(lastParams()).toMatchObject({ type: 'transcript', page: 1 }),
		);
		await screen.findByText('2 results');
	});

	it('searches for the chosen speaker', async () => {
		startAt('?q=hope');
		const user = userEvent.setup();
		renderPage();
		await screen.findByText('2 results');

		await user.selectOptions(screen.getByRole('combobox'), 'Dave Patterson');

		await waitFor(() =>
			expect(lastParams()).toMatchObject({
				speaker: 'Dave Patterson',
				page: 1,
			}),
		);
		await screen.findByText('2 results');
	});
});

describe('AISearch page: opening results', () => {
	beforeEach(() => {
		reply = {
			status: 200,
			data: envelope([result(5, { title: 'Grace in Practice' })]),
		};
		startAt('?q=grace');
	});

	it('opens the sermon when a card is clicked', async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(await screen.findByText('Grace in Practice'));

		await waitFor(() => expect(window.location.pathname).toBe('/sermons/5'));
	});

	it('opens the AI chat for the sermon from the chat button, not the sermon page', async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(
			await screen.findByRole('button', {
				name: 'Open AI chat for Grace in Practice',
			}),
		);

		await waitFor(() => expect(window.location.pathname).toBe('/ai-chat'));
		const params = new URLSearchParams(window.location.search);
		expect(params.get('sermonId')).toBe('5');
		expect(params.get('title')).toBe('Grace in Practice');
		expect(params.get('speaker')).toBe('Dave Patterson');
	});
});
