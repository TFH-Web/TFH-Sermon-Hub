// @vitest-environment jsdom
import type { AccountInfo } from '@azure/msal-browser';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import axios, {
	type AxiosAdapter,
	AxiosError,
	type InternalAxiosRequestConfig,
} from 'axios';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '$/components/ToastContext';
import { useAuth } from '$/lib/auth';
import SermonDetail from './SermonDetail';

vi.mock('@iconify-icon/react', () => ({ Icon: () => null }));
vi.mock('react-youtube', () => ({ default: () => null }));
vi.mock('$/components/MainLayout', () => ({
	default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('$/components/SermonTranscript', () => ({ default: () => null }));
vi.mock('$/modals/EditSermonModal', () => ({ default: () => null }));
vi.mock('$/modals/DeleteSermonModal', () => ({ default: () => null }));

const body = (id: number) => ({
	id,
	title: `Sermon ${id}`,
	videoLink: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	duration: 60,
	date: '2026-10-15',
	description: 'About grace',
	tags: [],
	speaker: { id: 1, firstName: 'Dave', lastName: 'Patterson' },
	status: 'Published',
	summary: `Saved summary ${id}`,
	summarySource: undefined as 'ai' | 'manual' | null | undefined,
	summaryRegenState: 'idle',
});
type Body = ReturnType<typeof body>;
const originalAdapter = axios.defaults.adapter;
const clients: QueryClient[] = [];
let records: Record<number, Body>;
let requests: { url: string | undefined; payload: unknown }[];
let saveStatus: number;
let releaseSave: (() => void) | null;
let saveGate: Promise<void> | null;

function auth(account = 'jack', roles = ['Admin']) {
	useAuth.setState({
		status: 'ready',
		account: { homeAccountId: account } as AccountInfo,
		roles,
		message: null,
	});
}

function reply(
	config: InternalAxiosRequestConfig,
	status: number,
	data: unknown,
) {
	return { config, status, data, statusText: '', headers: {} };
}

const adapter: AxiosAdapter = async config => {
	if (config.method === 'patch') {
		const payload = JSON.parse(config.data);
		requests.push({ url: config.url, payload });
		if (saveGate) await saveGate;
		if (saveStatus !== 200) {
			throw new AxiosError(
				'Save rejected',
				'ERR_BAD_REQUEST',
				config,
				undefined,
				reply(config, saveStatus, {
					error: 'Summary regeneration is active. Wait for it to finish.',
					message: 'Summary regeneration is active. Wait for it to finish.',
				}),
			);
		}
		const id = Number(config.url?.split('/').at(-1));
		records[id] = { ...records[id], summary: payload.summary };
		return reply(config, 200, records[id]);
	}
	if (config.url === '/api/sermons') {
		return reply(config, 200, Object.values(records));
	}
	const id = Number(config.url?.split('/').at(-1));
	return reply(config, 200, records[id]);
};

function open() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	clients.push(client);
	const router = createMemoryRouter(
		[{ path: '/sermons/:id', element: <SermonDetail /> }],
		{ initialEntries: ['/sermons/1'] },
	);
	render(
		<QueryClientProvider client={client}>
			<ToastProvider>
				<RouterProvider router={router} />
			</ToastProvider>
		</QueryClientProvider>,
	);
	return { client, router };
}

async function edit(text?: string) {
	fireEvent.click(
		await screen.findByRole('button', { name: 'Edit Summary Manually' }),
	);
	const field = screen.getByRole('textbox', { name: 'Summary text' });
	if (text !== undefined) fireEvent.change(field, { target: { value: text } });
	return field as HTMLTextAreaElement;
}

function holdSave() {
	saveGate = new Promise(resolve => {
		releaseSave = resolve;
	});
}

beforeEach(() => {
	records = { 1: body(1), 2: body(2) };
	requests = [];
	saveStatus = 200;
	releaseSave = null;
	saveGate = null;
	auth();
	axios.defaults.adapter = adapter;
});

afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
	axios.defaults.adapter = originalAdapter;
	useAuth.setState({
		status: 'loading',
		account: null,
		roles: [],
		message: null,
	});
});

describe('manual summary editing on the sermon page', () => {
	it.each([
		'ai',
		'manual',
		null,
		undefined,
	] as const)('labels a summary only when its saved origin is known AI (%s)', async origin => {
		records[1].summarySource = origin;
		open();
		await screen.findByRole('button', { name: 'Edit Summary Manually' });
		expect(screen.queryByText('AI generated') !== null).toBe(origin === 'ai');
	});

	it('initializes from saved text, resets and cancels without writing', async () => {
		open();
		expect((await edit()).value).toBe('Saved summary 1');
		fireEvent.change(screen.getByRole('textbox'), {
			target: { value: 'Unsaved draft' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
		expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
			'Saved summary 1',
		);
		fireEvent.change(screen.getByRole('textbox'), {
			target: { value: 'Another draft' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByRole('textbox')).toBeNull();
		expect((await edit()).value).toBe('Saved summary 1');
		expect(requests).toEqual([]);
	});

	it('saves only summary to the existing endpoint, updates cache and survives a page reload', async () => {
		const { client } = open();
		await edit('A manual summary');
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
		expect(requests).toEqual([
			{ url: '/api/sermons/1', payload: { summary: 'A manual summary' } },
		]);
		expect(client.getQueryData<Body>(['sermon', '1'])?.summary).toBe(
			'A manual summary',
		);
		expect(screen.getAllByText('A manual summary').length).toBeGreaterThan(0);
		cleanup();
		open();
		expect((await edit()).value).toBe('A manual summary');
	});

	it('retains a rejected draft and readable error so Retry can save it', async () => {
		saveStatus = 409;
		open();
		await edit('Keep this draft');
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect((await screen.findByRole('alert')).textContent).toContain(
			'Summary regeneration is active',
		);
		expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
			'Keep this draft',
		);
		expect(screen.queryByText('Summary saved successfully.')).toBeNull();
		saveStatus = 200;
		fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
		expect(requests).toHaveLength(2);
		expect(records[1].summary).toBe('Keep this draft');
	});

	it('prevents repeated saves and editing while the request is pending', async () => {
		holdSave();
		open();
		await edit('One request');
		const save = screen.getByRole('button', { name: 'Save' });
		fireEvent.click(save);
		fireEvent.click(save);
		await waitFor(() => expect(requests).toHaveLength(1));
		expect(
			(screen.getByRole('button', { name: 'Saving...' }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(
			true,
		);
		expect(
			(screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		await act(async () => {
			releaseSave?.();
		});
		await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
	});

	it('discards a draft when switching sermons, including when returning to the first', async () => {
		const { router } = open();
		await edit('Discard on navigation');
		await act(async () => {
			await router.navigate('/sermons/2');
		});
		expect((await edit()).value).toBe('Saved summary 2');
		await act(async () => {
			await router.navigate('/sermons/1');
		});
		expect((await edit()).value).toBe('Saved summary 1');
		expect(requests).toEqual([]);
	});

	it.each([
		200, 500,
	])('does not let a late %s response clear another sermon draft', async status => {
		holdSave();
		saveStatus = status;
		const { router } = open();
		await edit('First sermon request');
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => expect(requests).toHaveLength(1));
		await act(async () => {
			await router.navigate('/sermons/2');
		});
		await edit('Second sermon draft');
		await act(async () => {
			releaseSave?.();
		});
		expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
			'Second sermon draft',
		);
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.queryByText('Summary saved successfully.')).toBeNull();
	});

	it.each([
		'switch',
		'logout',
	])('ignores stale completions after a session %s', async change => {
		holdSave();
		const { client } = open();
		await edit('Previous session');
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => expect(requests).toHaveLength(1));
		await act(async () => {
			if (change === 'switch') auth('samip');
			else useAuth.setState({ status: 'signed-out', account: null, roles: [] });
		});
		expect(screen.queryByRole('textbox')).toBeNull();
		await act(async () => {
			releaseSave?.();
		});
		expect(client.getQueryData<Body>(['sermon', '1'])?.summary).toBe(
			'Saved summary 1',
		);
		expect(screen.queryByText('Summary saved successfully.')).toBeNull();
		if (change === 'switch')
			expect((await edit()).value).toBe('Saved summary 1');
	});

	it('does not expose an editable summary to staff without Admin permission', async () => {
		auth('staff', ['InternalUser']);
		open();
		const button = await screen.findByRole('button', {
			name: 'Edit Summary Manually',
		});
		expect((button as HTMLButtonElement).disabled).toBe(true);
		fireEvent.click(button);
		expect(screen.queryByRole('textbox')).toBeNull();
		expect(requests).toEqual([]);
	});
});
