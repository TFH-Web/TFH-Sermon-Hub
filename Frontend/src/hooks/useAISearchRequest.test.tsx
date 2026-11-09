// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import axios, { type AxiosAdapter, AxiosError } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useAISearchRequest, {
	type SearchApiResult,
	type SearchPage,
	type SearchParameters,
} from './useAISearchRequest';

const originalAdapter = axios.defaults.adapter;

// What the fake server answers with next. Each test sets this before rendering.
let reply: { status: number; data: unknown };
const adapter = vi.fn<AxiosAdapter>();

const baseParameters: SearchParameters = {
	q: 'grace',
	type: 'all',
	speaker: 'any',
	date: 'any',
	page: 1,
	pageSize: 6,
};

function result(id: number): SearchApiResult {
	return {
		id,
		title: `Sermon ${id}`,
		type: 'sermon',
		speaker: 'Dave Patterson',
		date: '2026-10-15',
		summary: `Summary ${id}`,
		ai_score: 0.5,
	};
}

function results(count: number) {
	return Array.from({ length: count }, (_, index) => result(index + 1));
}

// One client per test, shared by every render and rerender of that test.
let wrapper: ({ children }: { children: ReactNode }) => ReactNode;

beforeEach(() => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	wrapper = ({ children }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	reply = { status: 200, data: [] };
	adapter.mockReset();
	adapter.mockImplementation(async config => {
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
});

afterEach(() => {
	cleanup();
	axios.defaults.adapter = originalAdapter;
});

describe('useAISearchRequest', () => {
	it('does not call the API until the search is enabled', async () => {
		const { result: hook } = renderHook(
			() => useAISearchRequest(baseParameters, false),
			{ wrapper },
		);

		// A disabled query stays idle: no request and no data.
		expect(hook.current.fetchStatus).toBe('idle');
		expect(hook.current.data).toBeUndefined();
		expect(adapter).not.toHaveBeenCalled();
	});

	it('returns a paginated response unchanged and sends every parameter', async () => {
		const page: SearchPage = {
			items: results(2),
			page: 2,
			pageSize: 6,
			total: 8,
			totalPages: 2,
		};
		reply = { status: 200, data: page };
		const parameters: SearchParameters = {
			q: 'hope',
			type: 'sermon',
			speaker: 'Dave Patterson',
			date: '7d',
			page: 2,
			pageSize: 6,
		};

		const { result: hook } = renderHook(
			() => useAISearchRequest(parameters, true),
			{ wrapper },
		);

		await waitFor(() => expect(hook.current.isSuccess).toBe(true));
		expect(hook.current.data).toEqual(page);
		expect(adapter).toHaveBeenCalledTimes(1);
		const config = adapter.mock.calls[0][0];
		expect(config.url).toBe('/api/search');
		expect(config.params).toEqual(parameters);
	});

	it('slices a legacy array into the first page', async () => {
		reply = { status: 200, data: results(8) };

		const { result: hook } = renderHook(
			() => useAISearchRequest({ ...baseParameters, page: 1 }, true),
			{ wrapper },
		);

		await waitFor(() => expect(hook.current.isSuccess).toBe(true));
		expect(hook.current.data?.items.map(item => item.id)).toEqual([
			1, 2, 3, 4, 5, 6,
		]);
		expect(hook.current.data?.page).toBe(1);
		expect(hook.current.data?.pageSize).toBe(6);
		expect(hook.current.data?.total).toBe(8);
		expect(hook.current.data?.totalPages).toBe(2);
	});

	it('slices a legacy array into the second page', async () => {
		reply = { status: 200, data: results(8) };

		const { result: hook } = renderHook(
			() => useAISearchRequest({ ...baseParameters, page: 2 }, true),
			{ wrapper },
		);

		await waitFor(() => expect(hook.current.isSuccess).toBe(true));
		expect(hook.current.data?.items.map(item => item.id)).toEqual([7, 8]);
		expect(hook.current.data?.page).toBe(2);
		expect(hook.current.data?.total).toBe(8);
		expect(hook.current.data?.totalPages).toBe(2);
	});

	it('turns an empty legacy array into an empty page', async () => {
		reply = { status: 200, data: [] };

		const { result: hook } = renderHook(
			() => useAISearchRequest(baseParameters, true),
			{ wrapper },
		);

		await waitFor(() => expect(hook.current.isSuccess).toBe(true));
		expect(hook.current.data?.items).toEqual([]);
		expect(hook.current.data?.total).toBe(0);
		expect(hook.current.data?.totalPages).toBe(0);
	});

	it('reports a server error after a single attempt', async () => {
		reply = { status: 500, data: {} };

		const { result: hook } = renderHook(
			() => useAISearchRequest(baseParameters, true),
			{ wrapper },
		);

		await waitFor(() => expect(hook.current.isError).toBe(true));
		// retry is false so the user sees the error and chooses Retry themselves.
		expect(adapter).toHaveBeenCalledTimes(1);
	});

	it('asks again, with its own cache entry, when the page changes', async () => {
		reply = { status: 200, data: results(8) };

		const { result: hook, rerender } = renderHook(
			({ page }: { page: number }) =>
				useAISearchRequest({ ...baseParameters, page }, true),
			{ wrapper, initialProps: { page: 1 } },
		);
		await waitFor(() => expect(hook.current.data?.page).toBe(1));
		expect(adapter).toHaveBeenCalledTimes(1);

		rerender({ page: 2 });

		await waitFor(() => expect(hook.current.data?.page).toBe(2));
		expect(adapter).toHaveBeenCalledTimes(2);
		expect(adapter.mock.calls[1][0].params).toMatchObject({ page: 2 });
	});
});
