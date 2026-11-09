// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios, { type AxiosAdapter, AxiosError } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '$/lib/auth';
import Series, { seriesHue } from './Series';

vi.mock('@iconify-icon/react', () => ({ Icon: () => null }));
// The real layout brings in the sidebar and MSAL, none of which this page needs.
vi.mock('$/components/MainLayout', () => ({
	default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
// The modal has its own persistence tests; this page checks opening and role access.
vi.mock('$/modals/NewSeriesModal', () => ({
	default: ({ isOpen }: { isOpen: boolean }) =>
		isOpen ? <div role="dialog">New series</div> : null,
}));

const originalAdapter = axios.defaults.adapter;
const originalAuth = useAuth.getState();
const adapter = vi.fn<AxiosAdapter>();
let queryClient: QueryClient;

// What the fake server knows. Tests may change these before rendering.
let cards: unknown[];
let total: number;
// URL prefixes that answer with a server error until a test clears them.
const failing = new Set<string>();

const dave = { id: 1, firstName: 'Dave', lastName: 'Patterson' };
const jake = { id: 2, firstName: 'Jake', lastName: 'Taylor' };

beforeEach(() => {
	useAuth.setState({
		status: 'ready',
		account: null,
		roles: ['Admin'],
		message: null,
	});
	failing.clear();
	cards = [
		{
			id: 1,
			title: 'Live Your Best Life',
			sermonCount: 3,
			firstDate: '2024-01-07',
			lastDate: '2026-03-01',
			speakers: [dave, jake],
		},
		{
			id: 2,
			title: 'Grace Alone',
			sermonCount: 1,
			firstDate: '2026-02-01',
			lastDate: '2026-02-01',
			speakers: [dave],
		},
		{
			id: 3,
			title: 'Coming Soon',
			sermonCount: 0,
			firstDate: null,
			lastDate: null,
			speakers: [],
		},
	];
	total = 25;

	// The page asks for 2 retries per query; make them immediate so error tests are not slow.
	queryClient = new QueryClient({
		defaultOptions: { queries: { retryDelay: 0 } },
	});
	adapter.mockReset();
	adapter.mockImplementation(async config => {
		const url = config.url ?? '';
		const reply = (data: unknown) => ({
			data,
			status: 200,
			statusText: 'OK',
			headers: {},
			config,
		});
		if ([...failing].some(prefix => url.startsWith(prefix))) {
			throw new AxiosError(
				'Request failed',
				'ERR_BAD_RESPONSE',
				config,
				undefined,
				{ config, data: {}, status: 500, statusText: '', headers: {} },
			);
		}
		if (url.startsWith('/api/series')) {
			const page = Number(new URLSearchParams(url.split('?')[1]).get('page'));
			return reply({ items: cards, total, page, perPage: 12 });
		}
		if (url.startsWith('/api/sermons')) return reply([]);
		throw new Error(`unexpected request: ${url}`);
	});
	axios.defaults.adapter = adapter;
});

afterEach(() => {
	cleanup();
	useAuth.setState(originalAuth, true);
	queryClient.clear();
	axios.defaults.adapter = originalAdapter;
});

function renderPage() {
	return render(
		<QueryClientProvider client={queryClient}>
			<Series />
		</QueryClientProvider>,
	);
}

function requests(prefix: string) {
	return adapter.mock.calls
		.map(([config]) => config)
		.filter(config => (config.url ?? '').startsWith(prefix));
}

describe('Series page', () => {
	it('shows loading, then a card per series with its count, years and speakers', async () => {
		const { container } = renderPage();
		expect(screen.getByText('Loading...')).toBeTruthy();

		await screen.findByText('Grace Alone', { selector: 'h3' });

		const meta = Array.from(
			container.querySelectorAll('.series-meta-data'),
		).map(element => element.textContent);
		expect(meta).toEqual([
			'3 Sermons • 2024-2026 • Multiple speakers',
			'1 Sermon • 2026 • Patterson',
			'0 Sermons',
		]);
		expect(screen.queryByText('Loading...')).toBeNull();
	});

	it('asks for the first 12 series and for the sermons', async () => {
		renderPage();
		await screen.findByText('Grace Alone', { selector: 'h3' });

		expect(requests('/api/series')).toHaveLength(1);
		expect(requests('/api/series')[0].url).toBe(
			'/api/series?page=1&per_page=12',
		);
		expect(requests('/api/sermons')).toHaveLength(1);
	});

	it('works out the page count from the total and fetches the next page', async () => {
		const user = userEvent.setup();
		renderPage();
		await screen.findByText('Page 1 of 3'); // 25 series, 12 per page

		await user.click(screen.getByRole('button', { name: 'Next page' }));

		await screen.findByText('Page 2 of 3');
		expect(requests('/api/series')[1].url).toBe(
			'/api/series?page=2&per_page=12',
		);
	});

	it('shows one page, with both page buttons disabled, when there are no series', async () => {
		cards = [];
		total = 0;
		renderPage();

		await screen.findByText('Page 1 of 1');
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

	it('lets an Admin open the new series dialog', async () => {
		const user = userEvent.setup();
		renderPage();
		await screen.findByText('Page 1 of 3');
		expect(screen.queryByRole('dialog')).toBeNull();

		await user.click(screen.getByRole('button', { name: '+ New Series' }));

		expect(screen.getByRole('dialog')).toBeTruthy();
	});

	it('keeps series readable without offering creation to read-only staff', async () => {
		useAuth.setState({ roles: ['InternalUser'] });
		renderPage();
		await screen.findByText('Grace Alone', { selector: 'h3' });
		expect(screen.queryByRole('button', { name: '+ New Series' })).toBeNull();
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it.each([
		['series', '/api/series', '/api/sermons'],
		['sermons', '/api/sermons', '/api/series'],
	])('shows an error when the %s fail to load, and Retry reloads only that request', async (_name, broken, working) => {
		failing.add(broken);
		const user = userEvent.setup();
		renderPage();
		await screen.findByText('Failed to load series.');
		// One attempt plus the page's two retries.
		expect(requests(broken)).toHaveLength(3);
		expect(requests(working)).toHaveLength(1);

		failing.clear();
		await user.click(screen.getByRole('button', { name: 'Retry' }));

		await screen.findByText('Grace Alone', { selector: 'h3' });
		expect(requests(broken)).toHaveLength(4);
		expect(requests(working)).toHaveLength(1);
	});
});

describe('seriesHue', () => {
	it('gives the same banner colour every time for the same series', () => {
		expect(seriesHue(1, 'Grace Alone')).toBe(seriesHue(1, 'Grace Alone'));
	});

	it('stays within the colour wheel', () => {
		for (const [id, title] of [
			[1, 'Grace Alone'],
			[2, ''],
			[999, 'A very long series title that goes on'],
		] as const) {
			const hue = seriesHue(id, title);
			expect(hue).toBeGreaterThanOrEqual(0);
			expect(hue).toBeLessThan(360);
		}
	});
});
