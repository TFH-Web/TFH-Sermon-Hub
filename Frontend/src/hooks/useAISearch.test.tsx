// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import axios, { type AxiosAdapter, AxiosError } from 'axios';
import type { FormEvent, ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useAISearch from './useAISearch';
import type { SearchApiResult, SearchPage } from './useAISearchRequest';

// useAISearch merges new filters into window.location.search, not into the router's own state.
// A MemoryRouter never touches window.location, so these tests use BrowserRouter (as main.tsx
// does) and choose the starting address with window.history.replaceState before each render.
const originalAdapter = axios.defaults.adapter;
const adapter = vi.fn<AxiosAdapter>();

// What the fake server answers with next, and an optional gate that holds the answer back.
let reply: { status: number; data: unknown };
let gate: Promise<void> | null;
let wrapper: ({ children }: { children: ReactNode }) => ReactNode;

function item(id: number, title = `Sermon ${id}`): SearchApiResult {
	return {
		id,
		title,
		type: 'sermon',
		speaker: 'Dave Patterson',
		date: '2026-10-15',
		summary: `Summary ${id}`,
		ai_score: 0.5,
	};
}

function page(items: SearchApiResult[], overrides: Partial<SearchPage> = {}) {
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

function urlParams() {
	return new URLSearchParams(window.location.search);
}

function renderSearch() {
	return renderHook(() => useAISearch(), { wrapper });
}

// handleSubmit only uses preventDefault, so a bare object is enough.
function submitEvent() {
	const preventDefault = vi.fn();
	return {
		event: { preventDefault } as unknown as FormEvent<HTMLFormElement>,
		preventDefault,
	};
}

beforeEach(() => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	wrapper = ({ children }) => (
		<QueryClientProvider client={client}>
			<BrowserRouter>{children}</BrowserRouter>
		</QueryClientProvider>
	);
	reply = { status: 200, data: page([item(1)]) };
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
	axios.defaults.adapter = originalAdapter;
	window.history.replaceState({}, '', '/');
});

describe('useAISearch: reading the address bar', () => {
	it('starts empty and does not search when the address has no query', () => {
		const { result } = renderSearch();

		expect(result.current.query).toBe('');
		expect(result.current.type).toBe('all');
		expect(result.current.speaker).toBe('any');
		expect(result.current.date).toBe('any');
		expect(result.current.page).toBe(1);
		expect(result.current.showResults).toBe(false);
		expect(adapter).not.toHaveBeenCalled();
	});

	it('restores a submitted search from the address and requests it', async () => {
		startAt('?q=%20grace%20&type=sermon&speaker=Dave+Patterson&date=7d&page=3');

		const { result } = renderSearch();

		expect(result.current.query).toBe('grace');
		expect(result.current.submittedQuery).toBe('grace'); // trimmed
		expect(result.current.type).toBe('sermon');
		expect(result.current.speaker).toBe('Dave Patterson');
		expect(result.current.date).toBe('7d');
		expect(result.current.page).toBe(3);
		expect(result.current.showResults).toBe(true);
		await waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));
		expect(adapter.mock.calls[0][0].params).toEqual({
			q: 'grace',
			type: 'sermon',
			speaker: 'Dave Patterson',
			date: '7d',
			page: 3,
			pageSize: 6,
		});
	});

	it('falls back to All for an unknown content type', () => {
		startAt('?q=hope&type=bogus');

		const { result } = renderSearch();

		expect(result.current.type).toBe('all');
	});

	it.each([
		'0',
		'-1',
		'abc',
		'1.5',
		'99999999999999999999',
	])('falls back to page 1 for page=%s', value => {
		startAt(`?q=hope&page=${value}`);

		const { result } = renderSearch();

		expect(result.current.page).toBe(1);
	});

	it('treats an empty q as a search and requests it with an empty query', async () => {
		// Characterisation test: ?q= counts as "has searched". A possible bug for TFH-667, not fixed here.
		startAt('?q=');

		const { result } = renderSearch();

		expect(result.current.showResults).toBe(true);
		await waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));
		expect(adapter.mock.calls[0][0].params).toMatchObject({ q: '' });
	});
});

describe('useAISearch: submitting', () => {
	it('puts a first search, with default filters, into the address', async () => {
		const { result } = renderSearch();
		const { event, preventDefault } = submitEvent();

		act(() => result.current.setQuery('  hope  '));
		act(() => result.current.handleSubmit(event));

		expect(preventDefault).toHaveBeenCalledTimes(1);
		const params = urlParams();
		expect(params.get('q')).toBe('hope');
		expect(params.get('type')).toBe('all');
		expect(params.get('speaker')).toBe('any');
		expect(params.get('date')).toBe('any');
		expect(params.get('page')).toBe('1');
		await waitFor(() => expect(result.current.showResults).toBe(true));
		await waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));
	});

	it('refetches instead of navigating when the same first-page search is submitted again', async () => {
		startAt('?q=hope');
		const { result } = renderSearch();
		await waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		const before = window.location.search;
		const { event } = submitEvent();

		act(() => result.current.handleSubmit(event));

		await waitFor(() => expect(adapter).toHaveBeenCalledTimes(2));
		expect(window.location.search).toBe(before);
	});

	it('goes back to page 1 when the same query is submitted from a later page', async () => {
		startAt('?q=hope&page=3');
		const { result } = renderSearch();
		const { event } = submitEvent();

		act(() => result.current.handleSubmit(event));

		expect(urlParams().get('q')).toBe('hope');
		expect(urlParams().get('page')).toBe('1');
		await waitFor(() => expect(result.current.page).toBe(1));
	});

	it('updates the query and resets to page 1 when a different query is submitted', async () => {
		startAt('?q=hope&page=2');
		const { result } = renderSearch();
		const { event } = submitEvent();

		act(() => result.current.setQuery('peace'));
		act(() => result.current.handleSubmit(event));

		expect(urlParams().get('q')).toBe('peace');
		expect(urlParams().get('page')).toBe('1');
		await waitFor(() => expect(result.current.submittedQuery).toBe('peace'));
	});
});

describe('useAISearch: filters and paging', () => {
	it('keeps filters in the address without starting a search before the first submit', async () => {
		startAt('?utm=1');
		const { result } = renderSearch();

		act(() => result.current.setType('note'));
		act(() => result.current.setSpeaker('Jake Taylor'));
		act(() => result.current.setDate('28d'));

		const params = urlParams();
		expect(params.has('q')).toBe(false);
		expect(params.get('type')).toBe('note');
		expect(params.get('speaker')).toBe('Jake Taylor');
		expect(params.get('date')).toBe('28d');
		expect(params.get('utm')).toBe('1'); // unrelated parameters survive
		await waitFor(() => expect(result.current.type).toBe('note'));
		expect(result.current.showResults).toBe(false);
		expect(adapter).not.toHaveBeenCalled();
	});

	it.each([
		['type', (hook: ReturnType<typeof useAISearch>) => hook.setType('sermon')],
		[
			'speaker',
			(hook: ReturnType<typeof useAISearch>) => hook.setSpeaker('Jake Taylor'),
		],
		['date', (hook: ReturnType<typeof useAISearch>) => hook.setDate('7d')],
	])('returns to page 1 when the %s filter changes', async (_name, change) => {
		startAt('?q=hope&page=3');
		const { result } = renderSearch();
		await waitFor(() => expect(result.current.page).toBe(3));

		act(() => change(result.current));

		expect(urlParams().get('page')).toBe('1');
		expect(urlParams().get('q')).toBe('hope');
		await waitFor(() => expect(result.current.page).toBe(1));
	});

	it('moves to a valid page', async () => {
		startAt('?q=hope');
		const { result } = renderSearch();

		act(() => result.current.setPage(2));

		expect(urlParams().get('page')).toBe('2');
		await waitFor(() => expect(result.current.page).toBe(2));
	});

	it.each([
		0,
		-1,
		1.5,
		Number.NaN,
	])('ignores the invalid page %s', async invalidPage => {
		startAt('?q=hope&page=2');
		const { result } = renderSearch();
		await waitFor(() => expect(result.current.page).toBe(2));
		const before = window.location.search;

		act(() => result.current.setPage(invalidPage));

		expect(window.location.search).toBe(before);
		expect(result.current.page).toBe(2);
	});

	it('follows the address when Back or Forward changes the query', async () => {
		// Fragile by nature: depends on the router noticing a manual popstate. Drop it if it flakes.
		startAt('?q=old');
		const { result } = renderSearch();
		await waitFor(() => expect(result.current.query).toBe('old'));

		act(() => {
			window.history.pushState({}, '', '/ai-search?q=new');
			window.dispatchEvent(new PopStateEvent('popstate'));
		});

		await waitFor(() => expect(result.current.query).toBe('new'));
	});
});

describe('useAISearch: results', () => {
	it('maps the response into cards and reports loading while it waits', async () => {
		reply = {
			status: 200,
			data: page([item(5, 'Grace in Practice')], { total: 11, totalPages: 2 }),
		};
		let release: () => void = () => {};
		gate = new Promise<void>(resolve => {
			release = resolve;
		});
		startAt('?q=grace');

		const { result } = renderSearch();

		await waitFor(() => expect(result.current.isLoading).toBe(true));
		expect(result.current.visibleResults).toEqual([]);
		release();
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.visibleResults).toHaveLength(1);
		expect(result.current.visibleResults[0].title).toBe('Grace in Practice');
		expect(result.current.visibleResults[0].redirectTo).toBe('/sermons/5');
		expect(result.current.total).toBe(11);
		expect(result.current.totalPages).toBe(2);
		expect(result.current.isError).toBe(false);
	});

	it('reports a failed request and retries it on demand', async () => {
		reply = { status: 500, data: {} };
		startAt('?q=hope');
		const { result } = renderSearch();
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(adapter).toHaveBeenCalledTimes(1);

		reply = { status: 200, data: page([item(1)]) };
		act(() => result.current.retry());

		await waitFor(() => expect(adapter).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(result.current.isError).toBe(false));
		expect(result.current.visibleResults).toHaveLength(1);
	});
});
