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

// Replace YouTube with a controlled player for these tests.
async function mockVideoPlayer(page: Page) {
	await page.addInitScript(() => {
		Object.assign(window, {
			YT: {
				Player: class {
					private iframe: HTMLIFrameElement;

					constructor(
						container: HTMLElement,
						options: {
							playerVars?: {
								start?: number;
							};
							events: {
								onReady: (event: { target: unknown }) => void;
							};
						},
					) {
						this.iframe = document.createElement('iframe');
						// Keep a stable identifier even when the component changes the title.
						this.iframe.dataset.testid = 'test-video-player';
						// Record the starting position supplied when creating the player.
						this.iframe.dataset.startTime = String(
							options.playerVars?.start ?? 0,
						);
						container.replaceChildren(this.iframe);

						// Let the page finish registering its player callbacks.
						setTimeout(() => {
							options.events.onReady({ target: this });
						}, 0);
					}

					getIframe() {
						return this.iframe;
					}

					seekTo(seconds: number) {
						// Record the exact timestamp requested by the page.
						this.iframe.dataset.seekTime = String(seconds);
					}

					playVideo() {
						// Record that playback was requested.
						this.iframe.dataset.playing = 'true';
					}

					destroy() {
						this.iframe.remove();
					}
				},
			},
		});
	});
}

// Check mouse and keyboard activation using the same caption data.
for (const activation of ['click', 'Enter'] as const) {
	test(`timestamp seeks the embedded video using ${activation}`, async ({
		page,
	}) => {
		await mockVideoPlayer(page);
		await captionRoutes(page);
		await page.goto('/sermons/1');

		await page.getByRole('button', { name: 'Timestamps', exact: true }).click();

		const cue = page.getByRole('link', { name: 'Watch from 0:01' });
		const player = page.getByTestId('test-video-player');

		if (activation === 'click') {
			await cue.click();
		} else {
			await cue.focus();
			await cue.press('Enter');
		}

		// Seek to the actual cue start, including fractional seconds.
		await expect(player).toHaveAttribute('data-seek-time', '1.25');
		await expect(player).toHaveAttribute('data-playing', 'true');

		// The source link remains available for external navigation.
		await expect(cue).toHaveAttribute(
			'href',
			'https://www.youtube.com/watch?v=F_OiCiZ3Y3Y&t=1',
		);
		expect(page.context().pages()).toHaveLength(1);
	});
}

// Source links should set the initial position and preserve exact seek times.
for (const seconds of ['30.5', '0']) {
	test(`source link starts the video at ${seconds} seconds`, async ({
		page,
	}) => {
		await mockVideoPlayer(page);
		await captionRoutes(page);

		await page.goto(`/sermons/1?t=${seconds}`);

		const player = page.getByTestId('test-video-player');

		// YouTube's initial start setting uses whole seconds.
		await expect(player).toHaveAttribute(
			'data-start-time',
			String(Math.floor(Number(seconds))),
		);

		// The ready callback keeps the exact timestamp.
		await expect(player).toHaveAttribute('data-seek-time', seconds);
		await expect(player).toHaveAttribute('data-playing', 'true');
	});
}

test('invalid source timestamp does not request a seek', async ({ page }) => {
	await mockVideoPlayer(page);
	await captionRoutes(page);

	await page.goto('/sermons/1?t=invalid');

	const player = page.getByTestId('test-video-player');

	await expect(player).toBeVisible();
	await expect(player).toHaveAttribute('data-start-time', '0');
	await expect(player).not.toHaveAttribute('data-seek-time');
});

test('switching sermons clears the previous source timestamp', async ({
	page,
}) => {
	await mockVideoPlayer(page);
	const state = await captionRoutes(page);

	// Provide a second sermon for navigation without reloading the app.
	const secondSermon = {
		...state.sermon,
		id: 2,
		title: 'Second timestamp test sermon',
	};

	await page.route('**/api/sermons/2', route =>
		route.fulfill({ json: secondSermon }),
	);

	await page.route('**/api/sermons/2/transcript', route =>
		route.fulfill({
			json: {
				transcript: secondSermon.transcript,
				segments: state.segments,
			},
		}),
	);

	await page.goto('/sermons/1?t=30.5');

	const player = page.getByTestId('test-video-player');

	// Confirm the first sermon received its requested timestamp.
	await expect(player).toHaveAttribute('data-seek-time', '30.5');

	// Change the route without refreshing the browser.
	await page.evaluate(() => {
		window.history.pushState({}, '', '/sermons/2');
		window.dispatchEvent(new PopStateEvent('popstate'));
	});

	await expect(
		page.getByRole('heading', {
			name: secondSermon.title,
			level: 1,
			exact: true,
		}),
	).toBeVisible();

	// Confirm the replacement player belongs to the second sermon.
	await expect(player).toHaveAttribute('title', secondSermon.title);

	// The old sermon's requested timestamp must not carry over.
	await expect(player).toHaveAttribute('data-start-time', '0');
	await expect(player).not.toHaveAttribute('data-seek-time');
});
