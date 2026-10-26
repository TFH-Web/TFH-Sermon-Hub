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

/** Serve the import endpoints from a list of sermons the test can change, and record what the page posts. */
async function importRoutes(
	page: Page,
	initial: ReturnType<typeof sermon>[] = [],
) {
	const state = {
		sermons: initial,
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

		if (request.method() !== 'POST') return route.abort();
		state.posts.push({ path: url.pathname, body: request.postDataJSON() });
		await state.hold;

		if (url.pathname === '/api/import/youtube/video') {
			const imported = {
				...sermon(state.sermons.length + 1, 'Processing'),
				title: 'Imported from YouTube',
			};
			state.sermons.push(imported);
			return route.fulfill({ status: 201, json: imported });
		}
		if (url.pathname === '/api/import/youtube') {
			return route.fulfill({ json: { queued: false, report: REPORT } });
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
	const title = dialog.getByPlaceholder('Enter sermon title');
	await expect(title).toHaveValue('Imported from YouTube');
	await expect(title).not.toBeEditable();
	await expect(
		dialog.getByRole('button', { name: 'Open sermon' }),
	).toBeVisible();
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
