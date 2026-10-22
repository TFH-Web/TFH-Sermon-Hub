// @vitest-environment jsdom
import {
	QueryClient,
	QueryClientProvider,
	useQuery,
} from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import axios, { type AxiosAdapter, AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SummaryRegenStatus from '$/components/SummaryRegenStatus';
import { ToastProvider } from '$/components/ToastContext';
import { Sermon, type SummaryRegenState } from '$/types/sermon';
import {
	REGEN_GIVE_UP_MS,
	REGEN_POLL_MS,
	regenPollInterval,
	useSummaryRegeneration,
} from './useSummaryRegeneration';

// A stand-in for the server. It keeps the regeneration state, like the real sermon row does.
const server = {
	state: 'idle' as SummaryRegenState,
	error: null as string | null,
	requestedAt: null as string | null,
	posts: 0,
	inline: false, // true when there is no job queue, so the work is done before the answer
};

function sermonBody() {
	return {
		id: 7,
		title: 'Grace',
		videoLink: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		duration: 60,
		date: '2026-10-15',
		description: 'About grace',
		tags: [],
		speaker: { id: 1, firstName: 'Dave', lastName: 'Patterson' },
		status: 'Published',
		summaryRegenState: server.state,
		summaryRegenError: server.error,
		summaryRegenRequestedAt: server.requestedAt,
	};
}

const adapter: AxiosAdapter = async config => {
	const reply = (status: number, data: unknown) => ({
		data,
		status,
		statusText: '',
		headers: {},
		config,
	});
	if (config.method === 'post') {
		server.posts += 1;
		if (server.state === 'queued' || server.state === 'running') {
			const message = 'A summary is already being regenerated for this sermon';
			throw new AxiosError(
				message,
				'ERR_BAD_REQUEST',
				config,
				null,
				reply(409, { error: message }) as never,
			);
		}
		server.state = server.inline ? 'completed' : 'queued';
		server.error = null;
		server.requestedAt = new Date().toISOString().replace('Z', '');
		return reply(202, sermonBody());
	}
	return reply(200, sermonBody());
};

// The same pieces the sermon page uses: the sermon query with its polling rule, the hook and the status line.
function Page() {
	const query = useQuery({
		queryKey: ['sermon', '7'],
		queryFn: async () =>
			Sermon.parseAsync((await axios.get('/api/sermons/7')).data),
		refetchInterval: q => regenPollInterval(q.state.data),
	});
	const regen = useSummaryRegeneration('7', query.data);
	return (
		<div>
			<button type="button" onClick={regen.start} disabled={regen.isActive}>
				{regen.isActive ? 'Regenerating...' : 'Regenerate with AI'}
			</button>
			<SummaryRegenStatus state={regen.state} error={regen.error} />
		</div>
	);
}

function open() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<ToastProvider>
				<Page />
			</ToastProvider>
		</QueryClientProvider>,
	);
}

const originalAdapter = axios.defaults.adapter;

beforeEach(() => {
	server.state = 'idle';
	server.error = null;
	server.requestedAt = null;
	server.posts = 0;
	server.inline = false;
	axios.defaults.adapter = adapter;
	vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	axios.defaults.adapter = originalAdapter;
});

// The page's own button, not the pop-up's close button.
function regenButton() {
	return screen.getByRole('button', { name: /Regenerat/ });
}

// Let the server move on, then let the page's next check happen.
async function serverBecomes(
	state: SummaryRegenState,
	error: string | null = null,
) {
	server.state = state;
	server.error = error;
	await vi.advanceTimersByTimeAsync(REGEN_POLL_MS + 100);
}

describe('regenPollInterval', () => {
	const base = {
		id: 1,
		title: 'x',
		videoLink: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		duration: 1,
		date: new Date(),
		description: 'x',
		tags: [],
		speaker: { id: 1, firstName: 'a', lastName: 'b' },
		status: 'Published' as const,
	};
	const now = Date.parse('2026-10-21T12:00:00Z');

	it('checks again while a request is waiting or running', () => {
		for (const state of ['queued', 'running'] as const) {
			const sermon = {
				...base,
				summaryRegenState: state,
				summaryRegenRequestedAt: '2026-10-21T11:59:00',
			};
			expect(regenPollInterval(sermon, now)).toBe(REGEN_POLL_MS);
		}
	});

	it('stops once the request is finished or was never made', () => {
		for (const state of ['idle', 'completed', 'failed', undefined] as const) {
			expect(
				regenPollInterval({ ...base, summaryRegenState: state }, now),
			).toBe(false);
		}
		expect(regenPollInterval(undefined, now)).toBe(false);
	});

	it('gives up on a request that has outlived any worker', () => {
		const requested = new Date(now - REGEN_GIVE_UP_MS - 1000)
			.toISOString()
			.replace('Z', '');
		const sermon = {
			...base,
			summaryRegenState: 'running' as const,
			summaryRegenRequestedAt: requested,
		};
		expect(regenPollInterval(sermon, now)).toBe(false);
	});
});

describe('regenerating a summary', () => {
	it('follows the request from queued to running to done', async () => {
		open();
		fireEvent.click(
			await screen.findByRole('button', { name: 'Regenerate with AI' }),
		);

		expect((await screen.findByRole('status')).textContent).toContain(
			'Waiting',
		);
		expect((regenButton() as HTMLButtonElement).disabled).toBe(true);

		await serverBecomes('running');
		expect((await screen.findByRole('status')).textContent).toContain(
			'Writing',
		);

		await serverBecomes('completed');
		expect(screen.queryByRole('status')).toBeNull();
		expect(
			await screen.findByText('The summary was regenerated.'),
		).toBeTruthy();
		expect((regenButton() as HTMLButtonElement).disabled).toBe(false);
	});

	it('sends one request when the button is clicked twice', async () => {
		open();
		const button = await screen.findByRole('button', {
			name: 'Regenerate with AI',
		});

		fireEvent.click(button);
		fireEvent.click(button);
		await screen.findByRole('status');

		expect(server.posts).toBe(1);
	});

	it('reports a summary that finished before the answer came back', async () => {
		server.inline = true;
		open();

		fireEvent.click(
			await screen.findByRole('button', { name: 'Regenerate with AI' }),
		);

		expect(
			await screen.findByText('The summary was regenerated.'),
		).toBeTruthy();
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('shows a failure and lets the admin try again', async () => {
		open();
		fireEvent.click(
			await screen.findByRole('button', { name: 'Regenerate with AI' }),
		);
		await screen.findByRole('status');

		await serverBecomes('failed', 'model offline');

		expect((await screen.findByRole('alert')).textContent).toContain(
			'model offline',
		);
		expect(screen.getAllByText(/model offline/).length).toBeGreaterThan(1); // alert line and toast
		expect((regenButton() as HTMLButtonElement).disabled).toBe(false);

		fireEvent.click(regenButton());
		expect((await screen.findByRole('status')).textContent).toContain(
			'Waiting',
		);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('keeps showing the request after the page is left and opened again', async () => {
		const first = open();
		fireEvent.click(
			await screen.findByRole('button', { name: 'Regenerate with AI' }),
		);
		await screen.findByRole('status');
		first.unmount(); // the admin goes to another page
		await serverBecomes('running');

		open(); // and comes back

		expect((await screen.findByRole('status')).textContent).toContain(
			'Writing',
		);
		expect((regenButton() as HTMLButtonElement).disabled).toBe(true);
		expect(server.posts).toBe(1);

		await serverBecomes('completed');
		expect(screen.queryByRole('status')).toBeNull();
		expect((regenButton() as HTMLButtonElement).disabled).toBe(false);
	});

	it('shows an old failure on a fresh page without a pop-up', async () => {
		server.state = 'failed';
		server.error = 'model offline';

		open();

		expect((await screen.findByRole('alert')).textContent).toContain(
			'model offline',
		);
		expect(screen.getAllByText(/model offline/)).toHaveLength(1);
	});

	it('explains a refusal when someone else already started one', async () => {
		open();
		const button = await screen.findByRole('button', {
			name: 'Regenerate with AI',
		});
		server.state = 'running'; // another admin started it after this page loaded

		fireEvent.click(button);

		expect(
			await screen.findByText(
				'A summary is already being regenerated for this sermon',
			),
		).toBeTruthy();
		expect((await screen.findByRole('status')).textContent).toContain(
			'Writing',
		);
	});
});
