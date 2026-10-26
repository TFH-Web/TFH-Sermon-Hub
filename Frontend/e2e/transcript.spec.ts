// Tests for saved captions, pipeline refresh feedback and queued completion in the website.
import { expect, type Page, test } from '@playwright/test';
import { sermons } from './data';

async function captionRoutes(page: Page) {
	const state = {
		sermon: {
			...sermons[0],
			title: 'Caption test sermon',
			videoLink: 'https://www.youtube.com/watch?v=F_OiCiZ3Y3Y',
			transcript: 'Welcome to church. God is good.',
			processingError: null as string | null,
			processedAt: '2026-10-06T12:00:00',
		},
		segments: [
			{ start: 1.25, end: 3.5, text: 'Welcome to church.' },
			{ start: 3.5, end: 6.75, text: 'God is good.' },
		],
		polls: 0,
		finishAfterPolling: false,
	};
	await page.route('**/api/**', async route => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/api/sermons') {
			return route.fulfill({
				json: [{ ...state.sermon, transcript: undefined }],
			});
		}
		if (path === '/api/sermons/1') {
			if (state.finishAfterPolling && state.sermon.status === 'Processing') {
				state.polls += 1;
				if (state.polls >= 2) {
					state.sermon.status = 'Published';
					state.sermon.processedAt = '2026-10-06T13:00:00';
					state.sermon.transcript = 'New queued captions.';
					state.segments = [{ start: 5, end: 8, text: 'New queued captions.' }];
				}
			}
			return route.fulfill({ json: state.sermon });
		}
		if (path === '/api/sermons/1/transcript') {
			return route.fulfill({
				json: { transcript: state.sermon.transcript, segments: state.segments },
			});
		}
		return route.abort();
	});
	return state;
}

test('shows saved full text and timestamp links from the transcript API', async ({
	page,
}) => {
	/** Saved caption segments appear in the existing sermon page and link to the source video. */
	await captionRoutes(page);
	const errors: string[] = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.goto('/sermons/1');
	const panel = page.getByRole('region', { name: 'Sermon transcript' });
	await expect(panel).toHaveText('Welcome to church. God is good.');
	await expect(
		page.getByText('YouTube captions', { exact: true }),
	).toBeVisible();
	await page.getByRole('button', { name: 'Timestamps', exact: true }).click();
	await expect(
		panel.getByRole('link', { name: 'Watch from 0:01' }),
	).toHaveAttribute('href', 'https://www.youtube.com/watch?v=F_OiCiZ3Y3Y&t=1');
	await expect(panel.getByRole('link')).toHaveCount(2);
	await page.getByRole('button', { name: 'Full text', exact: true }).click();
	await expect(panel).toHaveText('Welcome to church. God is good.');
	expect(errors).toEqual([]);
});

test('tag keywords stay highlighted in full text and timestamp views', async ({
	page,
}) => {
	const state = await captionRoutes(page);
	state.sermon.tags = [
		{ name: 'God', source: 'ai' },
		{ name: 'C++', source: 'manual' },
	];
	state.sermon.transcript = 'GOD is good. C++ is literal; <script> is text.';
	state.segments = [{ start: 1, end: 4, text: state.sermon.transcript }];
	await page.goto('/sermons/1');
	const panel = page.getByRole('region', { name: 'Sermon transcript' });
	await expect(panel.locator('mark')).toHaveText(['GOD', 'C++']);
	await expect(panel).toHaveText(state.sermon.transcript);
	await expect(panel.locator('script')).toHaveCount(0);
	await page.getByRole('button', { name: 'Timestamps', exact: true }).click();
	await expect(panel.locator('mark')).toHaveText(['GOD', 'C++']);
	await expect(panel.getByRole('link')).toHaveAttribute(
		'href',
		'https://www.youtube.com/watch?v=F_OiCiZ3Y3Y&t=1',
	);
});

test('refresh disables the action until the saved caption text is updated', async ({
	page,
}) => {
	/** A real reprocess request shows busy feedback and refreshes the stored transcript after completion. */
	const state = await captionRoutes(page);
	let finish = () => {};
	const gate = new Promise<void>(resolve => {
		finish = resolve;
	});
	await page.route('**/api/sermons/1/reprocess', async route => {
		await gate;
		state.sermon.transcript = 'Refreshed captions.';
		state.sermon.processedAt = '2026-10-06T13:00:00';
		state.segments = [{ start: 5, end: 8, text: 'Refreshed captions.' }];
		await route.fulfill({ status: 202, json: state.sermon });
	});
	await page.goto('/sermons/1');
	await page
		.getByRole('button', { name: 'Refresh captions', exact: true })
		.click();
	await expect(
		page.getByRole('button', { name: 'Fetching captions…' }),
	).toBeDisabled();
	finish();
	await expect(
		page.getByRole('region', { name: 'Sermon transcript' }),
	).toHaveText('Refreshed captions.');
	await expect(
		page.getByRole('button', { name: 'Refresh captions', exact: true }),
	).toBeEnabled();
});

test('processing errors preserve the old text and permit another refresh', async ({
	page,
}) => {
	/** Quota failures retain the previous transcript, show the required action and recover on retry. */
	const state = await captionRoutes(page);
	let attempts = 0;
	await page.route('**/api/sermons/1/reprocess', async route => {
		attempts += 1;
		if (attempts === 1) {
			state.sermon.status = 'Failed';
			state.sermon.processingError =
				'fetch_transcript: YouTube quota exceeded; wait for the daily quota reset, then reprocess';
		} else {
			state.sermon.status = 'Published';
			state.sermon.processingError = null;
			state.sermon.processedAt = '2026-10-06T13:00:00';
			state.sermon.transcript = 'Recovered captions.';
			state.segments = [{ start: 5, end: 8, text: 'Recovered captions.' }];
		}
		await route.fulfill({ status: 202, json: state.sermon });
	});
	await page.goto('/sermons/1');
	await page
		.getByRole('button', { name: 'Refresh captions', exact: true })
		.click();
	await expect(page.locator('.SermonDetail-transcript-error')).toContainText(
		'quota exceeded',
	);
	await expect(
		page.getByRole('region', { name: 'Sermon transcript' }),
	).toHaveText('Welcome to church. God is good.');
	await page
		.getByRole('button', { name: 'Refresh captions', exact: true })
		.click();
	await expect(
		page.getByRole('region', { name: 'Sermon transcript' }),
	).toHaveText('Recovered captions.');
	await expect(page.locator('.SermonDetail-transcript-error')).toHaveCount(0);
});

test('queued completion refreshes the transcript after the sermon status changes', async ({
	page,
}) => {
	/** Polling follows queued processing and loads the newly saved cue list when the worker finishes. */
	const state = await captionRoutes(page);
	await page.route('**/api/sermons/1/reprocess', async route => {
		state.sermon.status = 'Processing';
		state.finishAfterPolling = true;
		await route.fulfill({ status: 202, json: state.sermon });
	});
	await page.goto('/sermons/1');
	await page
		.getByRole('button', { name: 'Refresh captions', exact: true })
		.click();
	await expect(
		page.getByRole('button', { name: 'Fetching captions…' }),
	).toBeDisabled();
	await expect(
		page.getByRole('region', { name: 'Sermon transcript' }),
	).toHaveText('New queued captions.', { timeout: 15000 });
	await page.getByRole('button', { name: 'Timestamps', exact: true }).click();
	await expect(
		page.getByRole('link', { name: 'Watch from 0:05' }),
	).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Refresh captions', exact: true }),
	).toBeEnabled();
});
