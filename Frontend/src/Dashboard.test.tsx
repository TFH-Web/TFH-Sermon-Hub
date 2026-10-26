// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	act,
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios, { type AxiosAdapter } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';

vi.mock('$/components/MainLayout', () => ({
	default: ({ children, title }: { children: ReactNode; title: string }) => (
		<main>
			<h1>{title}</h1>
			{children}
		</main>
	),
}));
vi.mock('@iconify-icon/react', () => ({ Icon: () => null }));
vi.mock('$/components/ImportActivity', () => ({ default: () => null }));
vi.mock('$/components/RecentActivity', () => ({ default: () => null }));
vi.mock('$/components/PopularTags', () => ({ default: () => null }));

const endpoints = ['/api/sermons', '/api/series', '/api/speakers'] as const;
type Endpoint = (typeof endpoints)[number];
const counts = [
	{ endpoint: '/api/sermons', label: 'Total Sermons', total: '450' },
	{ endpoint: '/api/series', label: 'Series', total: '71' },
	{ endpoint: '/api/speakers', label: 'Speakers', total: '37' },
] as const;
const speaker = { id: 1, firstName: 'Dave', lastName: 'Patterson' };

function sermon(id: number, title: string, date = '2026-10-20') {
	return {
		id,
		title,
		videoLink: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		duration: 120,
		date,
		description: 'A saved sermon',
		tags: [],
		speaker,
		series: { id: 1, title: 'Grace' },
		status: 'Published',
	};
}

function pages() {
	return {
		'/api/sermons': {
			// Preserve the server's order instead of re-sorting this bounded page.
			items: [
				sermon(19, 'First in server order', '2026-09-01'),
				sermon(17, 'Second in server order', '2026-10-20'),
				sermon(13, 'Third in server order', '2026-10-19'),
				sermon(11, 'Fourth in server order', '2026-10-18'),
				sermon(2, 'Fifth in server order', '2026-10-17'),
			],
			page: 1,
			pageSize: 5,
			total: 450,
			totalPages: 90,
		},
		'/api/series': {
			items: [
				{
					id: 1,
					title: 'Grace',
					sermonCount: 8,
					firstDate: '2026-09-01',
					lastDate: '2026-10-20',
					speakers: [speaker],
				},
			],
			total: 71,
			page: 1,
			perPage: 1,
		},
		'/api/speakers': {
			items: [{ ...speaker, sermonCount: 12 }],
			page: 1,
			pageSize: 1,
			total: 37,
			totalPages: 37,
		},
	};
}

const originalAdapter = axios.defaults.adapter;
let data: ReturnType<typeof pages>;
let handlers: Record<Endpoint, () => unknown | Promise<unknown>>;
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>;
const clients: QueryClient[] = [];

beforeEach(() => {
	data = pages();
	handlers = {
		'/api/sermons': () => data['/api/sermons'],
		'/api/series': () => data['/api/series'],
		'/api/speakers': () => data['/api/speakers'],
	};
	adapter = vi.fn<AxiosAdapter>(async config => {
		const endpoint = config.url as Endpoint;
		if (!endpoints.includes(endpoint))
			throw new Error(`Unexpected dashboard request: ${config.url}`);
		return {
			data: await handlers[endpoint](),
			status: 200,
			statusText: 'OK',
			headers: {},
			config,
		};
	});
	axios.defaults.adapter = adapter;
});

afterEach(() => {
	cleanup();
	for (const client of clients) client.clear();
	clients.length = 0;
	axios.defaults.adapter = originalAdapter;
	vi.restoreAllMocks();
});

function client() {
	const instance = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
		},
	});
	clients.push(instance);
	return instance;
}

function page(instance = client()) {
	render(
		<QueryClientProvider client={instance}>
			<Dashboard />
		</QueryClientProvider>,
	);
	return instance;
}

function card(label: string) {
	const element = screen.getByRole('heading', { name: label }).parentElement;
	if (!element) throw new Error(`Missing stat card: ${label}`);
	return within(element);
}

function requests(endpoint: Endpoint) {
	return adapter.mock.calls.filter(([config]) => config.url === endpoint);
}

async function loaded() {
	for (const { label, total } of counts)
		await waitFor(() => expect(card(label).getByText(total)).toBeTruthy());
}

it('uses bounded requests and server totals, preserving the returned sermon order', async () => {
	page();
	await loaded();
	expect(adapter).toHaveBeenCalledTimes(3);
	expect(requests('/api/sermons')[0][0].params).toEqual({
		page: 1,
		pageSize: 5,
		sort: 'Newest',
	});
	expect(requests('/api/series')[0][0].params).toEqual({
		page: 1,
		per_page: 1,
	});
	expect(requests('/api/speakers')[0][0].params).toEqual({
		page: 1,
		pageSize: 1,
	});
	const table = within(screen.getByRole('table'));
	expect(table.getAllByRole('rowheader').map(cell => cell.textContent)).toEqual(
		data['/api/sermons'].items.map(item => item.title),
	);
	expect(
		table
			.getByRole('link', { name: 'First in server order' })
			.getAttribute('href'),
	).toBe('/sermons/19');
	expect(screen.getByText('Search tracking not available yet')).toBeTruthy();
});

it('shows zero totals and an explicit empty table state without an error', async () => {
	for (const endpoint of endpoints) {
		data[endpoint].items = [];
		data[endpoint].total = 0;
	}
	data['/api/sermons'].totalPages = 0;
	data['/api/speakers'].totalPages = 0;
	page();
	await waitFor(() =>
		expect(
			within(screen.getByRole('table')).getByText('No sermons yet.'),
		).toBeTruthy(),
	);
	for (const { label } of counts)
		expect(card(label).getByText('0')).toBeTruthy();
	expect(screen.queryByText("Couldn't load")).toBeNull();
	expect(screen.queryByRole('status')).toBeNull();
});

it.each(
	counts,
)('$label can fail and retry without refetching successful sections', async ({
	endpoint,
	label,
	total,
}) => {
	handlers[endpoint] = vi
		.fn<() => Promise<unknown>>()
		.mockRejectedValueOnce(new Error('Network unavailable'))
		.mockResolvedValue(data[endpoint]);
	page();
	await waitFor(() =>
		expect(card(label).getByText("Couldn't load")).toBeTruthy(),
	);
	for (const other of counts.filter(item => item.endpoint !== endpoint))
		expect(card(other.label).getByText(other.total)).toBeTruthy();
	if (endpoint === '/api/sermons')
		expect(screen.getByText("Couldn't load recent sermons.")).toBeTruthy();
	else
		expect(
			screen.getByRole('link', { name: 'First in server order' }),
		).toBeTruthy();
	await userEvent.click(card(label).getByRole('button', { name: 'Retry' }));
	await waitFor(() => expect(card(label).getByText(total)).toBeTruthy());
	expect(
		screen.getByRole('link', { name: 'First in server order' }),
	).toBeTruthy();
	for (const other of endpoints)
		expect(requests(other)).toHaveLength(other === endpoint ? 2 : 1);
	expect(screen.queryByText("Couldn't load recent sermons.")).toBeNull();
});

it.each(
	counts,
)('$label has its own loading state while other sections remain usable', async ({
	endpoint,
	label,
	total,
}) => {
	let resolve!: (value: unknown) => void;
	const pending = new Promise<unknown>(done => {
		resolve = done;
	});
	handlers[endpoint] = () => pending;
	page();
	for (const other of counts.filter(item => item.endpoint !== endpoint))
		await waitFor(() =>
			expect(card(other.label).getByText(other.total)).toBeTruthy(),
		);
	expect(
		card(label).getByRole('status', { name: `Loading ${label}` }),
	).toBeTruthy();
	if (endpoint !== '/api/sermons')
		expect(
			screen.getByRole('link', { name: 'First in server order' }),
		).toBeTruthy();
	await act(async () => resolve(data[endpoint]));
	await waitFor(() => expect(card(label).getByText(total)).toBeTruthy());
	expect(screen.queryByRole('status', { name: `Loading ${label}` })).toBeNull();
});

it('does not read or overwrite legacy full-array list caches', async () => {
	const instance = client();
	const legacySermons = [
		{ ...sermon(99, 'Legacy cached sermon'), date: new Date('2026-10-20') },
	];
	instance.setQueryData(['sermons'], legacySermons);
	instance.setQueryData(['speakers'], [speaker]);
	instance.setQueryData(['series'], [{ id: 99, title: 'Legacy series' }]);
	page(instance);
	await loaded();
	expect(screen.queryByText('Legacy cached sermon')).toBeNull();
	expect(instance.getQueryData(['sermons'])).toEqual(legacySermons);
	expect(instance.getQueryData(['speakers'])).toEqual([speaker]);
	expect(instance.getQueryData(['series'])).toEqual([
		{ id: 99, title: 'Legacy series' },
	]);
	expect(
		instance.getQueryData([
			'sermons',
			'dashboard',
			{ page: 1, pageSize: 5, sort: 'Newest' },
		]),
	).toMatchObject({ total: 450 });
	expect(instance.getQueryData(['series', 'count'])).toMatchObject({
		total: 71,
	});
	expect(instance.getQueryData(['speakers', 'count'])).toMatchObject({
		total: 37,
	});
});

it('refetches dashboard pages when existing mutation query prefixes are invalidated', async () => {
	const instance = page();
	await loaded();
	data['/api/sermons'] = {
		...data['/api/sermons'],
		items: [sermon(20, 'Newly saved sermon')],
		total: 451,
	};
	data['/api/series'] = { ...data['/api/series'], total: 72 };
	data['/api/speakers'] = { ...data['/api/speakers'], total: 38 };
	await act(async () => {
		await Promise.all(
			['sermons', 'series', 'speakers'].map(prefix =>
				instance.invalidateQueries({ queryKey: [prefix] }),
			),
		);
	});
	await waitFor(() =>
		expect(card('Total Sermons').getByText('451')).toBeTruthy(),
	);
	expect(card('Series').getByText('72')).toBeTruthy();
	expect(card('Speakers').getByText('38')).toBeTruthy();
	expect(screen.getByRole('link', { name: 'Newly saved sermon' })).toBeTruthy();
	expect(screen.queryByText('First in server order')).toBeNull();
	for (const endpoint of endpoints) expect(requests(endpoint)).toHaveLength(2);
});

it.each(
	counts,
)('$label rejects a non-paginated response instead of displaying a false count', async ({
	endpoint,
	label,
}) => {
	handlers[endpoint] = () => data[endpoint].items;
	page();
	await waitFor(() =>
		expect(card(label).getByText("Couldn't load")).toBeTruthy(),
	);
	expect(card(label).getByRole('button', { name: 'Retry' })).toBeTruthy();
	for (const other of counts.filter(item => item.endpoint !== endpoint))
		expect(card(other.label).getByText(other.total)).toBeTruthy();
});
