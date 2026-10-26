// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios, {
	type AxiosAdapter,
	AxiosError,
	type AxiosResponse,
	type InternalAxiosRequestConfig,
} from 'axios';
import type { ReactNode } from 'react';
// From react-router-dom, like the UploadSermonModal inside this page, so the router and its useNavigate are the same instance.
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { POLL_INTERVAL, POLL_WINDOW } from '$/hooks/useSyncRuns';
import type { ImportReport, SyncRun } from '$/types/import';
import ImportUpload from './ImportUpload';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('$/components/ToastContext', () => ({
	useToast: () => ({ showToast }),
}));
// The real layout brings in the sidebar, the header and fonts, none of which this page needs.
vi.mock('$/components/MainLayout', () => ({
	default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// What a finished sync reports, as in the e2e tests.
const REPORT: ImportReport = {
	series_created: 1,
	sermons_created: 3,
	sermons_updated: 0,
	sermons_unchanged: 0,
	skipped_playlists: [],
	skipped_private: [],
	skipped_not_ready: [],
	skipped_too_long: ['A Long Service (vLong000001): 75 min'],
	multiple_series: [],
	unknown_speakers: [],
	multiple_speakers: [],
	queue_failures: [],
};

// How every card names the sync these runs are for.
const TITLE = 'YouTube Library Import • Sep 1, 2026 – Sep 30, 2026';

function queuedRun(id: number): SyncRun {
	return {
		id,
		dateFrom: '2026-09-01',
		dateTo: '2026-09-30',
		state: 'queued',
		createdAt: '2026-10-20T06:49:24.744828',
		startedAt: null,
		finishedAt: null,
		seriesCreated: null,
		sermonsCreated: null,
		sermonsUpdated: null,
		sermonsUnchanged: null,
		report: null,
		error: null,
	};
}

function runningRun(id: number): SyncRun {
	return {
		...queuedRun(id),
		state: 'running',
		startedAt: '2026-10-20T06:49:24.746437',
	};
}

function succeededRun(id: number): SyncRun {
	return {
		...runningRun(id),
		state: 'succeeded',
		finishedAt: '2026-10-20T06:49:24.746941',
		seriesCreated: REPORT.series_created,
		sermonsCreated: REPORT.sermons_created,
		sermonsUpdated: REPORT.sermons_updated,
		sermonsUnchanged: REPORT.sermons_unchanged,
		report: REPORT,
	};
}

function failedRun(id: number, error: string): SyncRun {
	return {
		...runningRun(id),
		state: 'failed',
		finishedAt: '2026-10-20T06:49:24.746941',
		error,
	};
}

// The fake server. Each test sets what it has saved, newest run first, and how a new sync is answered.
const originalAdapter = axios.defaults.adapter;
let runs: SyncRun[];
let runsListFails: boolean;
let syncReply: (config: InternalAxiosRequestConfig) => AxiosResponse;
let requests: string[];
let syncBodies: unknown[];

/** Answer with data, or throw the error axios would for a status of 400 or more. */
function reply(
	config: InternalAxiosRequestConfig,
	status: number,
	data: unknown,
): AxiosResponse {
	const response = {
		data,
		status,
		statusText: String(status),
		headers: {},
		config,
	};
	if (status < 400) return response;
	throw new AxiosError(
		`Request failed with status code ${status}`,
		'ERR_BAD_RESPONSE',
		config,
		undefined,
		response,
	);
}

const adapter: AxiosAdapter = async config => {
	const method = config.method ?? 'get';
	const url = config.url ?? '';
	requests.push(`${method} ${url}`);

	if (method === 'get' && url === '/api/sermons') {
		// No sermons: these tests are about the sync runs.
		return reply(config, 200, {
			items: [],
			total: 0,
			page: config.params?.page ?? 1,
			pageSize: config.params?.pageSize ?? 10,
			totalPages: 0,
		});
	}
	if (method === 'get' && url === '/api/import/youtube/runs') {
		if (runsListFails) return reply(config, 500, { error: 'Server error' });
		// The list leaves out each run's report.
		return reply(
			config,
			200,
			runs.map(run => ({ ...run, report: undefined })),
		);
	}
	const detail = url.match(/^\/api\/import\/youtube\/runs\/(\d+)$/);
	if (method === 'get' && detail) {
		const run = runs.find(r => r.id === Number(detail[1]));
		return run
			? reply(config, 200, run)
			: reply(config, 404, {
					error: 'Sync run not found',
					message: 'Sync run not found',
				});
	}
	if (method === 'post' && url === '/api/import/youtube') {
		syncBodies.push(config.data);
		return syncReply(config);
	}
	throw new Error(`Unexpected request: ${method} ${url}`);
};

function count(request: string) {
	return requests.filter(r => r === request).length;
}

beforeEach(() => {
	vi.clearAllMocks();
	runs = [];
	runsListFails = false;
	requests = [];
	syncBodies = [];
	syncReply = config => reply(config, 500, { error: 'No sync was expected' });
	axios.defaults.adapter = adapter;
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	axios.defaults.adapter = originalAdapter;
});

function renderPage() {
	// Failed requests are retried, but without waiting, so the error states show up quickly.
	const queryClient = new QueryClient({
		defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<ImportUpload />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

async function openTab(name: string) {
	await userEvent.click(screen.getByRole('button', { name }));
}

it('restores a queued run on load and locks the sync form', async () => {
	runs = [queuedRun(4)];
	renderPage();

	// A sync that is going leads Active Imports, whichever tab the page is on.
	await screen.findByText(TITLE);
	expect(screen.getByText('Queued')).toBeTruthy();

	await openTab('Bulk Import');
	const sync = screen.getByRole('button', {
		name: 'Sync queued…',
	}) as HTMLButtonElement;
	expect(sync.disabled).toBe(true);
	expect(
		(screen.getByLabelText('From date') as HTMLInputElement).disabled,
	).toBe(true);
	expect((screen.getByLabelText('To date') as HTMLInputElement).disabled).toBe(
		true,
	);
	expect(screen.queryByRole('dialog')).toBeNull();
});

it('does not pop up for a run that was already over when the page loaded', async () => {
	runs = [succeededRun(4)];
	renderPage();

	await openTab('Import History');
	await screen.findByText(TITLE);
	expect(screen.getByText('Complete')).toBeTruthy();
	expect(screen.queryByRole('dialog')).toBeNull();
});

it("opens a finished run's report from its title in Sync History", async () => {
	runs = [succeededRun(4)];
	renderPage();

	await openTab('Import History');
	await userEvent.click(await screen.findByRole('button', { name: TITLE }));

	const dialog = await screen.findByRole('dialog');
	await waitFor(() => expect(dialog.textContent).toContain('Sermons created'));
	expect(dialog.textContent).toContain('Sep 1, 2026 – Sep 30, 2026');
	expect(dialog.textContent).toContain('Skipped: too long (1)');
});

it('polls a queued run to its end, then opens its report and refetches the lists', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	runs = [queuedRun(4)];
	renderPage();
	await screen.findByText(TITLE);
	expect(screen.getByText('Queued')).toBeTruthy();
	const listsBefore = count('get /api/sermons');

	// The worker finishes. Nothing tells the page, so it finds out by polling.
	runs = [succeededRun(4)];
	await act(async () => {
		await vi.advanceTimersByTimeAsync(POLL_INTERVAL);
	});

	const dialog = await screen.findByRole('dialog');
	await waitFor(() => expect(dialog.textContent).toContain('Sermons created'));
	expect(dialog.textContent).toContain('YouTube bulk import');
	// The sync is over, so it has left Active Imports.
	expect(screen.queryByText('Queued')).toBeNull();
	await waitFor(() =>
		expect(count('get /api/sermons')).toBeGreaterThan(listsBefore),
	);
});

it.each([
	'Upload New',
	'Bulk Import',
])('offers status recovery on %s after active-run polling fails', async tab => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	runs = [queuedRun(4)];
	renderPage();
	await screen.findByText(TITLE);
	if (tab === 'Bulk Import') await openTab(tab);

	runsListFails = true;
	await act(async () => {
		await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 2);
	});
	const check = await screen.findByRole('button', { name: 'Check status' });
	expect(screen.getByText('Queued')).toBeTruthy();
	if (tab === 'Bulk Import') {
		expect(
			(
				screen.getByRole('button', {
					name: 'Sync queued…',
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	}

	const stoppedAt = count('get /api/import/youtube/runs');
	await act(async () => {
		await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 2);
	});
	expect(count('get /api/import/youtube/runs')).toBe(stoppedAt);

	// Recover on the same tab without starting a second import or waiting for the ten-minute timeout.
	runsListFails = false;
	await act(async () => {
		fireEvent.click(check);
	});
	await waitFor(() =>
		expect(screen.queryByRole('button', { name: 'Check status' })).toBeNull(),
	);
	expect(count('get /api/import/youtube/runs')).toBeGreaterThan(stoppedAt);
	expect(syncBodies).toHaveLength(0);

	// A successful status check also resumes automatic polling through completion.
	runs = [succeededRun(4)];
	await act(async () => {
		await vi.advanceTimersByTimeAsync(POLL_INTERVAL);
	});
	const dialog = await screen.findByRole('dialog');
	await waitFor(() => expect(dialog.textContent).toContain('Sermons created'));
	expect(screen.queryByText('Queued')).toBeNull();
});

it('stops polling after the window, and Check status looks again', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	runs = [queuedRun(4)];
	renderPage();
	await screen.findByText(TITLE);

	await act(async () => {
		await vi.advanceTimersByTimeAsync(POLL_WINDOW + POLL_INTERVAL);
	});
	const check = await screen.findByRole('button', { name: 'Check status' });

	const polled = count('get /api/import/youtube/runs');
	await act(async () => {
		await vi.advanceTimersByTimeAsync(60_000);
	});
	expect(count('get /api/import/youtube/runs')).toBe(polled);

	runs = [succeededRun(4)];
	await act(async () => {
		fireEvent.click(check);
	});
	const dialog = await screen.findByRole('dialog');
	await waitFor(() => expect(dialog.textContent).toContain('Sermons created'));
});

it('says so when there are no finished syncs', async () => {
	renderPage();

	await openTab('Import History');
	await screen.findByText('No finished syncs yet');
});

it('shows an error box in Sync History, and Retry loads the runs', async () => {
	runsListFails = true;
	runs = [succeededRun(4)];
	renderPage();

	await openTab('Import History');
	await screen.findByText('Failed to load sync history.');

	runsListFails = false;
	await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
	await screen.findByText(TITLE);
	expect(screen.queryByText('Failed to load sync history.')).toBeNull();
});

it('follows the sync already going when another is refused (409)', async () => {
	const message =
		'A YouTube sync is already running. Wait for run 7 to finish.';
	syncReply = config => {
		// Someone else's sync was running all along.
		runs = [runningRun(7)];
		return reply(config, 409, { error: message, message, runId: 7 });
	};
	renderPage();

	await openTab('Bulk Import');
	await userEvent.click(
		screen.getByRole('button', { name: 'Sync from YouTube' }),
	);

	await waitFor(() => expect(showToast).toHaveBeenCalledWith(message, 'info'));
	expect(screen.queryByRole('dialog')).toBeNull();
	const sync = (await screen.findByRole('button', {
		name: 'Syncing…',
	})) as HTMLButtonElement;
	expect(sync.disabled).toBe(true);
});

it('opens the failed run when the queue is unavailable (503)', async () => {
	const message = 'The job queue is unavailable. Please try again later.';
	syncReply = config => {
		runs = [failedRun(5, 'queue: Connection refused')];
		return reply(config, 503, {
			error: message,
			message,
			runId: 5,
			state: 'failed',
		});
	};
	renderPage();

	await openTab('Bulk Import');
	await userEvent.click(
		screen.getByRole('button', { name: 'Sync from YouTube' }),
	);

	const dialog = await screen.findByRole('dialog');
	await waitFor(() =>
		expect(dialog.textContent).toContain(
			'The job queue was unavailable, so the sync never started. Try again.',
		),
	);
	expect(showToast).not.toHaveBeenCalledWith(expect.anything(), 'error');
});

it('shows why a sync failed, and lets the next one go', async () => {
	runs = [failedRun(3, 'videos: HTTP 500: backendError')];
	syncReply = config => {
		runs = [succeededRun(4), ...runs];
		return reply(config, 200, {
			queued: false,
			report: REPORT,
			runId: 4,
			state: 'succeeded',
		});
	};
	renderPage();

	await openTab('Import History');
	await screen.findByText('videos: HTTP 500: backendError');
	expect(screen.getByText('Failed')).toBeTruthy();

	// A failed sync is over, so the form is free for another.
	await openTab('Bulk Import');
	const sync = screen.getByRole('button', {
		name: 'Sync from YouTube',
	}) as HTMLButtonElement;
	expect(sync.disabled).toBe(false);
	await userEvent.click(sync);

	const dialog = await screen.findByRole('dialog');
	await waitFor(() => expect(dialog.textContent).toContain('Sermons created'));
	// With no dates filled in, the whole channel is asked for, so no dates are sent.
	expect(syncBodies).toEqual(['{}']);
});
