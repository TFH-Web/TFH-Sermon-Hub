// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios, { type AxiosAdapter, AxiosError } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '$/lib/auth';
import Sermons from './Sermons';

vi.mock('@iconify-icon/react', () => ({ Icon: () => null }));
// The real layout brings in the sidebar and MSAL, none of which this page needs.
vi.mock('$/components/MainLayout', () => ({
	default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
// The floating add button is real; only the upload form behind it is stubbed.
vi.mock('$/modals/UploadSermonModal', () => ({ default: () => null }));

const originalAdapter = axios.defaults.adapter;
let queryClient: QueryClient;
const adapter = vi.fn<AxiosAdapter>();

// What the fake server knows. Each test may change these before rendering.
let speakers: unknown[];
let series: unknown[];
let tags: unknown[];
let sermonItems: unknown[];
let sermonTotalPages: number;
// URL prefixes that answer with a server error until a test clears them.
const failing = new Set<string>();

// Plain JSON, as the API sends it, so the page's own schemas do the parsing.
function sermonJson(id: number, title: string) {
	return {
		id,
		title,
		videoLink: 'https://youtu.be/sample1',
		duration: 2500,
		date: '2026-04-19',
		description: 'A message.',
		tags: [],
		speaker: { id: 1, firstName: 'Dave', lastName: 'Patterson' },
		status: 'Published',
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	failing.clear();
	speakers = [
		{ id: 3, firstName: 'Mary', lastName: 'Jones' },
		{ id: 1, firstName: 'Dave', lastName: 'Patterson' },
		{ id: 2, firstName: 'Jake', lastName: 'Taylor' },
	];
	series = [
		{ id: 2, title: 'Live Your Best Life' },
		{ id: 1, title: 'Grace Alone' },
	];
	tags = [
		{ name: 'faith', source: 'manual', count: 3 },
		{ name: 'hope', source: 'ai', count: 1 },
	];
	sermonItems = [sermonJson(1, 'Sermon One'), sermonJson(2, 'Sermon Two')];
	sermonTotalPages = 1;
	useAuth.setState({
		status: 'ready',
		account: null,
		roles: [],
		message: null,
	});

	queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
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
		// The series URL carries its query string, so match on the start of the URL.
		if (url.startsWith('/api/speakers')) return reply(speakers);
		if (url.startsWith('/api/series')) return reply({ items: series });
		if (url.startsWith('/api/tags')) return reply(tags);
		if (url.startsWith('/api/sermons')) {
			return reply({
				items: sermonItems,
				page: config.params.page,
				pageSize: 9,
				total: sermonItems.length,
				totalPages: sermonTotalPages,
			});
		}
		throw new Error(`unexpected request: ${url}`);
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
			<Sermons />
		</QueryClientProvider>,
	);
}

// Every request the page made, in order.
function requests(prefix: string) {
	return adapter.mock.calls
		.map(([config]) => config)
		.filter(config => (config.url ?? '').startsWith(prefix));
}

function sermonParams() {
	return requests('/api/sermons').map(config => config.params);
}

function lastSermonParams() {
	return sermonParams().at(-1);
}

// A new filter means a new query, so the page shows its loading shell until the cards come back.
async function cardsShown() {
	await screen.findByText('Sermon One');
}

// The status and topic radios are `hidden`, so getByRole cannot see them; their labels can be found.
function choose(label: string) {
	fireEvent.click(screen.getByLabelText(label));
}

const speakerSelect = () => screen.getAllByRole('combobox')[0];
const seriesSelect = () => screen.getAllByRole('combobox')[1];
const sortSelect = () => screen.getAllByRole('combobox')[2];

function optionTexts(select: HTMLElement) {
	return Array.from((select as HTMLSelectElement).options).map(
		option => option.textContent,
	);
}

describe('Sermons page: loading and first request', () => {
	it('shows a disabled filter shell while loading, then one card per sermon', async () => {
		const { container } = renderPage();

		expect(screen.getByText('Loading...')).toBeTruthy();
		expect(
			container.querySelectorAll('fieldset[disabled]').length,
		).toBeGreaterThan(0);

		await cardsShown();
		expect(screen.getByText('Sermon Two')).toBeTruthy();
		expect(screen.queryByText('Loading...')).toBeNull();
		expect(container.querySelectorAll('fieldset[disabled]')).toHaveLength(0);
	});

	it('asks for the first page, newest first, with no filters', async () => {
		renderPage();
		await cardsShown();

		expect(sermonParams()).toEqual([{ page: 1, pageSize: 9, sort: 'Newest' }]);
		expect(requests('/api/speakers')).toHaveLength(1);
		expect(requests('/api/series')[0].url).toBe(
			'/api/series?page=1&per_page=100',
		);
		expect(requests('/api/tags')[0].params).toEqual({ used: true });
	});

	it('offers speakers and series sorted by id and capitalised topics after All', async () => {
		const { container } = renderPage();
		await cardsShown();

		expect(optionTexts(speakerSelect())).toEqual([
			'All Speakers',
			'Dave Patterson',
			'Jake Taylor',
			'Mary Jones',
		]);
		expect(optionTexts(seriesSelect())).toEqual([
			'All Series',
			'Grace Alone',
			'Live Your Best Life',
		]);
		expect(optionTexts(sortSelect())).toEqual([
			'Newest',
			'Oldest',
			'Relevance',
		]);
		const topics = Array.from(container.querySelectorAll('.Sermons-topic')).map(
			label => label.textContent,
		);
		expect(topics).toEqual(['All', 'Faith', 'Hope']);
	});
});

describe('Sermons page: filters, sorting and paging', () => {
	it('filters by status and starts again at page 1', async () => {
		renderPage();
		await cardsShown();

		choose('Draft');

		await waitFor(() =>
			expect(lastSermonParams()).toMatchObject({ status: 'Draft', page: 1 }),
		);
		await cardsShown();
	});

	it('filters by topic', async () => {
		renderPage();
		await cardsShown();

		choose('Faith');

		await waitFor(() =>
			expect(lastSermonParams()).toMatchObject({ topic: 'faith' }),
		);
		await cardsShown();
	});

	it('filters by speaker as a number and drops the filter for All Speakers', async () => {
		const user = userEvent.setup();
		renderPage();
		await cardsShown();

		await user.selectOptions(speakerSelect(), 'Jake Taylor');

		await waitFor(() =>
			expect(lastSermonParams()).toMatchObject({ speaker_id: 2 }),
		);
		await cardsShown();
		await user.selectOptions(speakerSelect(), 'All Speakers');
		await waitFor(() =>
			expect(lastSermonParams()).not.toHaveProperty('speaker_id'),
		);
		await cardsShown();
	});

	it('filters by series as a number and drops the filter for All Series', async () => {
		const user = userEvent.setup();
		renderPage();
		await cardsShown();

		await user.selectOptions(seriesSelect(), 'Grace Alone');

		await waitFor(() =>
			expect(lastSermonParams()).toMatchObject({ series_id: 1 }),
		);
		await cardsShown();
		await user.selectOptions(seriesSelect(), 'All Series');
		await waitFor(() =>
			expect(lastSermonParams()).not.toHaveProperty('series_id'),
		);
		await cardsShown();
	});

	it('sorts oldest first', async () => {
		const user = userEvent.setup();
		renderPage();
		await cardsShown();

		await user.selectOptions(sortSelect(), 'Oldest');

		await waitFor(() =>
			expect(lastSermonParams()).toMatchObject({ sort: 'Oldest' }),
		);
		await cardsShown();
	});

	it('moves to the next page and goes back to page 1 when a filter changes', async () => {
		sermonTotalPages = 2;
		const user = userEvent.setup();
		renderPage();
		await cardsShown();
		expect(screen.getByText('Page 1 of 2')).toBeTruthy();

		await user.click(screen.getByRole('button', { name: 'Next page' }));

		await waitFor(() => expect(lastSermonParams()).toMatchObject({ page: 2 }));
		await cardsShown();
		await screen.findByText('Page 2 of 2');
		choose('Draft');
		await waitFor(() =>
			expect(lastSermonParams()).toMatchObject({ status: 'Draft', page: 1 }),
		);
		await cardsShown();
	});
});

describe('Sermons page: empty and error states', () => {
	it('says so when no sermons match', async () => {
		sermonItems = [];
		renderPage();

		await screen.findByText('No sermons match the selected filters.');
		expect(screen.queryByText('Sermon One')).toBeNull();
	});

	it('shows an error when the sermons fail to load, and Retry fetches only the sermons again', async () => {
		failing.add('/api/sermons');
		const user = userEvent.setup();
		renderPage();
		await screen.findByText('Failed to load sermons.');
		expect(sermonParams()).toHaveLength(1);

		failing.clear();
		await user.click(screen.getByRole('button', { name: 'Retry' }));

		await cardsShown();
		expect(sermonParams()).toHaveLength(2);
		expect(requests('/api/speakers')).toHaveLength(1);
		expect(requests('/api/tags')).toHaveLength(1);
	});

	it('shows an error when a filter list fails, and Retry reloads only that list', async () => {
		failing.add('/api/tags');
		const user = userEvent.setup();
		renderPage();
		await screen.findByText('Failed to load sermon filters.');
		expect(requests('/api/tags')).toHaveLength(1);

		failing.clear();
		await user.click(screen.getByRole('button', { name: 'Retry' }));

		await cardsShown();
		expect(requests('/api/tags')).toHaveLength(2);
		expect(requests('/api/speakers')).toHaveLength(1);
		expect(requests('/api/series')).toHaveLength(1);
		expect(requests('/api/sermons')).toHaveLength(1);
	});
});

describe('Sermons page: admin button', () => {
	it('shows the add button to an admin', async () => {
		useAuth.setState({ roles: ['Admin'] });
		renderPage();
		await cardsShown();

		expect(screen.getByRole('button', { name: '+' })).toBeTruthy();
	});

	it('hides the add button from everyone else', async () => {
		renderPage();
		await cardsShown();

		expect(screen.queryByRole('button', { name: '+' })).toBeNull();
	});
});
