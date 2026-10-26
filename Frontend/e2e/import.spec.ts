// Tests for importing from YouTube: the upload modal, the bulk sync, and the Import page's lists.
import { expect, type Page, test } from '@playwright/test';
import { sermons } from './data';
import { paginated } from './pagination';

// What a finished sync reports: POST /api/import/youtube without a job queue.
const REPORT = {
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

function sermon(
	id: number,
	status: string,
	processingError: string | null = null,
) {
	return { ...sermons[0], id, title: `Import ${id}`, status, processingError };
}

/** A saved sync run, as GET /api/import/youtube/runs/<id> sends it. */
interface Run {
	id: number;
	dateFrom: string | null;
	dateTo: string | null;
	state: string;
	createdAt: string;
	startedAt: string | null;
	finishedAt: string | null;
	seriesCreated: number | null;
	sermonsCreated: number | null;
	sermonsUpdated: number | null;
	sermonsUnchanged: number | null;
	report: typeof REPORT | null;
	error: string | null;
}

type Range = { from?: string; to?: string };

/** A sync that finished, for the range it was asked for. */
function savedRun(id: number, range: Range): Run {
	return {
		id,
		dateFrom: range.from ?? null,
		dateTo: range.to ?? null,
		state: 'succeeded',
		createdAt: '2026-10-20T06:49:24.744828',
		startedAt: '2026-10-20T06:49:24.746437',
		finishedAt: '2026-10-20T06:49:24.746941',
		seriesCreated: REPORT.series_created,
		sermonsCreated: REPORT.sermons_created,
		sermonsUpdated: REPORT.sermons_updated,
		sermonsUnchanged: REPORT.sermons_unchanged,
		report: REPORT,
		error: null,
	};
}

/** A sync the worker has not started: no times, no counts and no report yet. */
function queuedRun(id: number, range: Range): Run {
	return {
		...savedRun(id, range),
		state: 'queued',
		startedAt: null,
		finishedAt: null,
		seriesCreated: null,
		sermonsCreated: null,
		sermonsUpdated: null,
		sermonsUnchanged: null,
		report: null,
	};
}

/** A sync that ended with an error and no report. */
function failedRun(id: number, range: Range, error: string): Run {
	return {
		...queuedRun(id, range),
		state: 'failed',
		finishedAt: '2026-10-20T06:49:24.746941',
		error,
	};
}

/** Serve the import endpoints from a list of sermons the test can change, and record what the page posts. */
async function importRoutes(
	page: Page,
	initial: ReturnType<typeof sermon>[] = [],
) {
	const state = {
		sermons: initial,
		// The sync runs the server has saved, oldest first. POST /api/import/youtube adds one.
		runs: [] as Run[],
		// Makes the next POST /api/import/youtube fail as if the job queue were down.
		failNextSync: false,
		// The id of a sermon the next video import answers with, as a video that was imported before.
		duplicateOf: null as number | null,
		posts: [] as { path: string; body: unknown }[],
		// Makes GET /api/sermons fail, as if the server were down.
		broken: false,
		// Every POST waits for this before it answers, so a test can look at the page mid-request.
		hold: Promise.resolve(),
	};

	await page.route('**/api/**', async route => {
		const request = route.request();
		const url = new URL(request.url());

		if (request.method() === 'GET' && url.pathname === '/api/sermons') {
			if (state.broken) {
				return route.fulfill({
					status: 500,
					json: { error: 'Internal server error' },
				});
			}
			// The setupRoutes helper ignores the status filter, which is the thing these lists depend on.
			const status = url.searchParams.get('status');
			return paginated(
				state.sermons.filter(s => s.status === status),
				route,
				url.searchParams,
			);
		}

		// The Import page reads the saved sync runs on every visit. The list leaves out each report.
		if (
			request.method() === 'GET' &&
			url.pathname === '/api/import/youtube/runs'
		) {
			return route.fulfill({
				json: state.runs.map(run => ({ ...run, report: undefined })).reverse(),
			});
		}
		const runPath = url.pathname.match(/^\/api\/import\/youtube\/runs\/(\d+)$/);
		if (request.method() === 'GET' && runPath) {
			const run = state.runs.find(r => r.id === Number(runPath[1]));
			return run
				? route.fulfill({ json: run })
				: route.fulfill({
						status: 404,
						json: {
							error: 'Sync run not found',
							message: 'Sync run not found',
						},
					});
		}

		if (request.method() !== 'POST') return route.abort();
		state.posts.push({ path: url.pathname, body: request.postDataJSON() });
		await state.hold;

		if (url.pathname === '/api/import/youtube/video') {
			const existing = state.sermons.find(s => s.id === state.duplicateOf);
			// 200 with the sermon that was already there, where a new one gets 201.
			if (existing) return route.fulfill({ status: 200, json: existing });
			const imported = {
				...sermon(state.sermons.length + 1, 'Processing'),
				title: 'Imported from YouTube',
			};
			state.sermons.push(imported);
			return route.fulfill({ status: 201, json: imported });
		}
		if (url.pathname === '/api/import/youtube') {
			const range: Range = request.postDataJSON() ?? {};
			if (state.failNextSync) {
				state.failNextSync = false;
				// The sync is saved as failed, and the request is refused.
				const run = failedRun(
					state.runs.length + 1,
					range,
					'queue: Connection refused',
				);
				state.runs.push(run);
				const message = 'The job queue is unavailable. Please try again later.';
				return route.fulfill({
					status: 503,
					json: { error: message, message, runId: run.id, state: 'failed' },
				});
			}
			// As without a job queue: the sync has already finished by the time this answers.
			const run = savedRun(state.runs.length + 1, range);
			state.runs.push(run);
			return route.fulfill({
				json: {
					queued: false,
					report: REPORT,
					runId: run.id,
					state: 'succeeded',
				},
			});
		}
		const reprocess = url.pathname.match(/^\/api\/sermons\/(\d+)\/reprocess$/);
		const retried =
			reprocess && state.sermons.find(s => s.id === Number(reprocess[1]));
		if (retried) {
			// As without a job queue: processing has already run by the time this answers.
			retried.status = 'Published';
			retried.processingError = null;
			return route.fulfill({ status: 202, json: retried });
		}
		return route.abort();
	});
	return state;
}

/** Hold every POST until the returned function is called. */
function holdPosts(state: Awaited<ReturnType<typeof importRoutes>>) {
	let release = () => {};
	state.hold = new Promise<void>(resolve => {
		release = resolve;
	});
	return () => release();
}

function tab(page: Page, name: string) {
	return page.getByRole('button', { name, exact: true });
}

function card(page: Page, title: string) {
	return page
		.locator('.Card')
		.filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

test('the upload modal rejects a bad link and sends a good one', async ({
	page,
}) => {
	const state = await importRoutes(page);
	await page.goto('/upload');
	await page.locator('.Header-upload').click();
	const dialog = page.getByRole('dialog');
	const link = dialog.getByLabel('YouTube link');
	const submit = dialog.getByRole('button', { name: 'Import & Process' });

	await link.fill('not a link');
	await submit.click();
	await expect(dialog.getByText('That is not a YouTube link.')).toBeVisible();
	expect(state.posts).toEqual([]);

	await link.fill('https://youtu.be/F_OiCiZ3Y3Y');
	await expect(dialog.getByText('That is not a YouTube link.')).toHaveCount(0);
	await submit.click();
	await expect
		.poll(() => state.posts)
		.toEqual([
			{
				path: '/api/import/youtube/video',
				body: { url: 'https://youtu.be/F_OiCiZ3Y3Y' },
			},
		]);
});

test('importing shows progress, then fills in the sermon details', async ({
	page,
}) => {
	const state = await importRoutes(page);
	const release = holdPosts(state);
	await page.goto('/upload');
	await page.locator('.Header-upload').click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('YouTube link').fill('https://youtu.be/F_OiCiZ3Y3Y');
	await dialog.getByRole('button', { name: 'Import & Process' }).click();

	await expect(
		dialog.getByRole('button', { name: 'Importing…' }),
	).toBeDisabled();
	await expect(dialog.getByLabel('YouTube link')).toBeDisabled();
	release();

	await expect(page.locator('.Toast-message')).toContainText(
		'Imported "Imported from YouTube". Processing started.',
	);
	const title = dialog.getByLabel('Sermon title');
	await expect(title).toHaveValue('Imported from YouTube');
	await expect(title).not.toBeEditable();
	// The rest of what the import saved, shown read-only. The mock sermon is the first of the shared fixtures.
	await expect(dialog.getByLabel('Speaker')).toHaveValue('Dave Patterson');
	await expect(dialog.getByLabel('Series')).toHaveValue('Grace Series');
	await expect(dialog.getByLabel('Date')).toHaveValue('2026-02-10');
	await expect(dialog.getByLabel('Description')).toHaveValue(
		'A message about grace.',
	);
	await expect(dialog.getByLabel('Description')).not.toBeEditable();
	await expect(
		dialog.getByRole('button', { name: 'Open sermon' }),
	).toBeVisible();
});

test('a duplicate import says so, and Open sermon still opens the sermon', async ({
	page,
}) => {
	const state = await importRoutes(page, [sermon(1, 'Published')]);
	state.duplicateOf = 1;
	await page.goto('/upload');
	await page.locator('.Header-upload').click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('YouTube link').fill('https://youtu.be/F_OiCiZ3Y3Y');
	await dialog.getByRole('button', { name: 'Import & Process' }).click();

	await expect(page.locator('.Toast-message')).toContainText(
		'"Import 1" was already imported.',
	);
	await expect(dialog.getByLabel('Sermon title')).toHaveValue('Import 1');

	await dialog.getByRole('button', { name: 'Open sermon' }).click();
	await expect(page).toHaveURL('/sermons/1');
});

test('neither the Import page nor the upload dialog offers processing checkboxes', async ({
	page,
}) => {
	await importRoutes(page);
	await page.goto('/upload');
	// Wait for the page, so an absent checkbox means it is gone and not that it has not shown yet.
	await expect(page.getByText('Upload or import content')).toBeVisible();
	await expect(page.getByRole('checkbox')).toHaveCount(0);

	await page.locator('.Header-upload').click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByLabel('YouTube link')).toBeVisible();
	await expect(dialog.getByRole('checkbox')).toHaveCount(0);
});

test('Sync from YouTube sends the date range and pops up the result', async ({
	page,
}) => {
	const state = await importRoutes(page);
	const release = holdPosts(state);
	await page.goto('/upload');
	await tab(page, 'Bulk Import').click();
	await page.getByLabel('From date').fill('2026-09-01');
	await page.getByLabel('To date').fill('2026-09-30');
	await page.getByRole('button', { name: 'Sync from YouTube' }).click();

	await expect(page.getByRole('button', { name: 'Syncing…' })).toBeDisabled();
	await expect(page.getByLabel('From date')).toBeDisabled();
	await expect
		.poll(() => state.posts)
		.toEqual([
			{
				path: '/api/import/youtube',
				body: { from: '2026-09-01', to: '2026-09-30' },
			},
		]);
	release();

	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText('YouTube bulk import');
	await expect(dialog).toContainText('Sep 1, 2026 – Sep 30, 2026');
	await expect(
		dialog.locator('.ImportSyncResult-count', { hasText: 'Sermons created' }),
	).toContainText('3');
	await expect(dialog.getByText('Skipped: too long (1)')).toBeVisible();
});

test('a processing sermon moves to Import History when it finishes', async ({
	page,
}) => {
	const state = await importRoutes(page, [
		sermon(1, 'Processing'),
		sermon(2, 'Published'),
	]);
	await page.goto('/upload');
	const active = card(page, 'Active Imports');
	await expect(active.locator('.ImportItem')).toHaveText([/Import 1/]);
	await expect(active.getByText('Processing', { exact: true })).toBeVisible();

	// The worker finishes. Nothing tells the page, so it has to find out by polling.
	state.sermons[0].status = 'Published';
	await expect(active.getByText('No active imports')).toBeVisible({
		timeout: 15000,
	});

	await tab(page, 'Import History').click();
	const history = card(page, 'Import History');
	await expect(history.locator('.ImportItem')).toHaveCount(2);
	await expect(
		history.getByRole('link', { name: 'Import 1', exact: true }),
	).toBeVisible();
	await expect(history.getByText('Complete', { exact: true })).toHaveCount(2);
});

test('a failed row shows its error, and Retry reprocesses it', async ({
	page,
}) => {
	const error =
		'fetch_transcript: YouTube quota exceeded; wait for the daily quota reset, then reprocess';
	const state = await importRoutes(page, [sermon(1, 'Failed', error)]);
	await page.goto('/upload');
	await tab(page, 'Failed Imports').click();
	const failed = card(page, 'Failed Imports');
	await expect(failed.getByText(error)).toBeVisible();
	await expect(failed.getByText('1 items')).toBeVisible();

	await failed.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(failed.getByText('No failed imports')).toBeVisible();
	expect(state.posts).toEqual([
		{ path: '/api/sermons/1/reprocess', body: null },
	]);

	await tab(page, 'Import History').click();
	await expect(
		card(page, 'Import History').getByRole('link', {
			name: 'Import 1',
			exact: true,
		}),
	).toBeVisible();
});

test('lists show their empty text, and an error box whose Retry recovers', async ({
	page,
}) => {
	const state = await importRoutes(page);
	await page.goto('/upload');
	await expect(page.getByText('No active imports')).toBeVisible();
	await tab(page, 'Import History').click();
	await expect(page.getByText('No import history yet')).toBeVisible();
	await tab(page, 'Failed Imports').click();
	await expect(page.getByText('No failed imports')).toBeVisible();
	await expect(page.getByText('0 items')).toBeVisible();

	// The server goes down. A failed fetch is retried a few times before the error shows, hence the wait.
	state.broken = true;
	await tab(page, 'Import History').click();
	const errorBox = page.locator('.ErrorBox');
	await expect(errorBox).toContainText('Failed to load import history.', {
		timeout: 15000,
	});

	state.broken = false;
	state.sermons.push(sermon(1, 'Published'));
	await errorBox.getByRole('button', { name: 'Retry' }).click();
	await expect(
		card(page, 'Import History').getByRole('link', {
			name: 'Import 1',
			exact: true,
		}),
	).toBeVisible();
});

const RANGE = { from: '2026-09-01', to: '2026-09-30' };

test('a queued sync survives a reload and completes', async ({ page }) => {
	const state = await importRoutes(page);
	state.runs.push(queuedRun(1, RANGE));
	await page.goto('/upload');
	// A sync that is going leads Active Imports.
	await expect(page.getByText('Queued', { exact: true })).toBeVisible();

	// The sync is not in the browser, so a reload loses nothing.
	await page.reload();
	await tab(page, 'Bulk Import').click();
	await expect(
		page.getByRole('button', { name: 'Sync queued…' }),
	).toBeDisabled();

	// The worker finishes. Nothing tells the page, so it has to find out by polling.
	state.runs[0] = savedRun(1, RANGE);
	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText('YouTube bulk import', { timeout: 15000 });
	await expect(
		dialog.locator('.ImportSyncResult-count', { hasText: 'Sermons created' }),
	).toContainText('3');
	await expect(
		page.getByRole('button', { name: 'Sync from YouTube' }),
	).toBeEnabled();
});

test('a sync that finishes while the page is away reports its result on return', async ({
	page,
}) => {
	const state = await importRoutes(page);
	state.runs.push(queuedRun(1, RANGE));
	await page.goto('/upload');
	await expect(page.getByText('Queued', { exact: true })).toBeVisible();

	// Away from the page, nothing polls. Leave through the navbar, which keeps what the page had loaded.
	await page.getByRole('link', { name: 'Dashboard' }).click();
	await expect(page).toHaveURL('/');
	state.runs[0] = savedRun(1, RANGE);

	// The page still has the sync as going from before, so it reports the end it finds on return.
	await page.getByRole('link', { name: 'Import / Upload' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText('YouTube bulk import');
	await expect(
		dialog.locator('.ImportSyncResult-count', { hasText: 'Sermons created' }),
	).toContainText('3');
});

test('a sync the queue refuses shows why, and the next one can go', async ({
	page,
}) => {
	const state = await importRoutes(page);
	state.failNextSync = true;
	await page.goto('/upload');
	await tab(page, 'Bulk Import').click();
	await page.getByRole('button', { name: 'Sync from YouTube' }).click();

	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText(
		'The job queue was unavailable, so the sync never started. Try again.',
	);
	await dialog
		.locator('.Modal-footer')
		.getByRole('button', { name: 'Close' })
		.click();
	await expect(dialog).toHaveCount(0);

	// A failed sync is over, so the form is free.
	await page.getByRole('button', { name: 'Sync from YouTube' }).click();
	await expect(dialog.getByText('Sync finished')).toBeVisible();
	expect(
		state.posts.filter(post => post.path === '/api/import/youtube'),
	).toHaveLength(2);
});

test('Sync History says when no sync has finished yet', async ({ page }) => {
	await importRoutes(page);
	await page.goto('/upload');
	await tab(page, 'Import History').click();
	await expect(
		card(page, 'Sync History').getByText('No finished syncs yet'),
	).toBeVisible();
});
