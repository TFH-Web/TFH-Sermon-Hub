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
	).toHaveAttribute('href', 'https://www.youtube.com/watch?v=F_OiCiZ3Y3Y&t=1s');
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
		'https://www.youtube.com/watch?v=F_OiCiZ3Y3Y&t=1s',
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

// Use a controlled player without making real YouTube requests.
async function mockVideoPlayer(page: Page, autoReady = true) {
	await page.addInitScript(autoReady => {
		let canStart = autoReady;
		const waiting: Array<() => void> = [];

		// Let a test decide when the player finishes loading.
		window.addEventListener('test-player-ready', () => {
			canStart = true;

			for (const ready of waiting.splice(0)) {
				ready();
			}
		});

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
								onError?: (event: { target: unknown; data: number }) => void;
							};
						},
					) {
						this.iframe = document.createElement('iframe');
						this.iframe.dataset.testid = 'test-video-player';

						// Record the initial position supplied by the page.
						this.iframe.dataset.startTime = String(
							options.playerVars?.start ?? 0,
						);
						container.replaceChildren(this.iframe);
						// Let tests simulate an unavailable video.
						this.iframe.addEventListener('test-player-error', () => {
							options.events.onError?.({ target: this, data: 100 });
						});

						const ready = () => {
							options.events.onReady({ target: this });
						};

						// Automatically load, or wait for the test's signal.
						if (canStart) {
							setTimeout(ready, 0);
						} else {
							waiting.push(ready);
						}
					}

					getIframe() {
						return this.iframe;
					}

					seekTo(seconds: number) {
						// Record the exact requested timestamp.
						this.iframe.dataset.seekTime = String(seconds);
					}

					playVideo() {
						this.iframe.dataset.playing = 'true';
					}

					destroy() {
						this.iframe.remove();
					}
				},
			},
		});
	}, autoReady);
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
			'https://www.youtube.com/watch?v=F_OiCiZ3Y3Y&t=1s',
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

test('the latest timestamp click waits until the player is ready', async ({
	page,
}) => {
	// Keep the player loading while the user selects timestamps.
	await mockVideoPlayer(page, false);
	await captionRoutes(page);
	await page.goto('/sermons/1');

	const player = page.getByTestId('test-video-player');
	await expect(player).toBeVisible();

	await page.getByRole('button', { name: 'Timestamps', exact: true }).click();

	// A later click should replace the earlier waiting timestamp.
	await page.getByRole('link', { name: 'Watch from 0:01' }).click();
	await page.getByRole('link', { name: 'Watch from 0:03' }).click();

	await expect(player).not.toHaveAttribute('data-seek-time');
	expect(page.context().pages()).toHaveLength(1);

	// Finish loading and check that the latest exact timestamp is used.
	await page.evaluate(() => {
		window.dispatchEvent(new Event('test-player-ready'));
	});

	await expect(player).toHaveAttribute('data-seek-time', '3.5');
	await expect(player).toHaveAttribute('data-playing', 'true');
});

// Provide another sermon for player-reset tests.
async function captionRoutesWithSecondSermon(page: Page) {
	const state = await captionRoutes(page);
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

	return secondSermon;
}

test('unavailable videos retain the external fallback and errors reset on navigation', async ({
	page,
	context,
}) => {
	await mockVideoPlayer(page);
	const secondSermon = await captionRoutesWithSecondSermon(page);

	// Keep the external-link check independent of YouTube availability.
	await context.route('https://www.youtube.com/watch?**', route =>
		route.fulfill({
			contentType: 'text/html',
			body: '<html><title>Source video fallback</title></html>',
		}),
	);

	await page.goto('/sermons/1');
	const player = page.getByTestId('test-video-player');

	// Wait for the current player before simulating its failure.
	await expect(player).toHaveAttribute('title', 'Caption test sermon');
	await player.dispatchEvent('test-player-error');

	const errorMessage =
		'This video could not be loaded. It may be unavailable or embedding may be disabled.';

	await expect(page.getByText(errorMessage, { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Timestamps', exact: true }).click();

	// A failed embedded player should allow the source link to open.
	const popupPromise = page.waitForEvent('popup');
	await page.getByRole('link', { name: 'Watch from 0:01' }).click();
	const popup = await popupPromise;

	await expect(popup).toHaveURL(
		'https://www.youtube.com/watch?v=F_OiCiZ3Y3Y&t=1s',
	);
	await popup.close();

	// Switching sermons must clear the previous video's error.
	await page.evaluate(() => {
		window.history.pushState({}, '', '/sermons/2');
		window.dispatchEvent(new PopStateEvent('popstate'));
	});

	await expect(player).toHaveAttribute('title', secondSermon.title);
	await expect(page.getByText(errorMessage, { exact: true })).toHaveCount(0);

	// The replacement player should still respond to transcript clicks.
	await page.getByRole('button', { name: 'Timestamps', exact: true }).click();
	await page.getByRole('link', { name: 'Watch from 0:03' }).click();

	await expect(player).toHaveAttribute('data-seek-time', '3.5');
});

test('switching sermons discards a timestamp waiting for player readiness', async ({
	page,
}) => {
	await mockVideoPlayer(page, false);
	const secondSermon = await captionRoutesWithSecondSermon(page);

	await page.goto('/sermons/1?t=30.5');
	const player = page.getByTestId('test-video-player');

	await expect(player).toBeVisible();

	// Leave the first sermon before its player finishes loading.
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

	// Release any waiting players, including the replacement player.
	await page.evaluate(() => {
		window.dispatchEvent(new Event('test-player-ready'));
	});

	await expect(player).toHaveAttribute('title', secondSermon.title);
	await expect(player).toHaveAttribute('data-start-time', '0');
	await expect(player).not.toHaveAttribute('data-seek-time');
});

test('editing shows saved tag origins without labeling unsaved changes', async ({
	page,
}) => {
	const state = await captionRoutes(page);
	state.sermon.tags = [
		{ name: 'grace', source: 'ai', count: 1 },
		{ name: 'faith', source: 'manual', count: 1 },
	];

	await page.goto('/sermons/1');
	await page.getByRole('button', { name: 'Edit', exact: true }).click();

	const dialog = page.getByRole('dialog');
	const savedTags = dialog.getByRole('region', {
		name: 'Saved tag origins',
	});

	// Only the saved AI tag receives an AI label.
	await expect(savedTags).toContainText('grace · AI Generated');
	await expect(savedTags).toContainText('faith');
	await expect(savedTags).not.toContainText('faith · AI Generated');

	// Editing the input must not invent a saved origin for new text.
	await dialog.getByPlaceholder('grace, faith, hope').fill('new-unsaved-tag');

	await expect(savedTags).not.toContainText('new-unsaved-tag');

	// Cancelling leaves the displayed saved tags unchanged.
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(dialog).toHaveCount(0);

	const detailTags = page.locator('.SermonDetail-tags');
	await expect(detailTags).toContainText('grace · AI Generated');
	await expect(detailTags).toContainText('faith');
	await expect(detailTags).not.toContainText('new-unsaved-tag');
});

// Invalid links and mismatched IDs must not produce playable or clickable links.
for (const scenario of [
	{
		name: 'invalid saved video link',
		videoLink: 'https://www.youtube.com.evil.example/watch?v=F_OiCiZ3Y3Y',
		youtubeVideoId: null,
	},
	{
		name: 'stored ID disagrees with the saved link',
		videoLink: 'https://www.youtube.com/watch?v=F_OiCiZ3Y3Y',
		youtubeVideoId: 'abcdefghijk',
	},
]) {
	test(`${scenario.name} displays a safe unavailable state`, async ({
		page,
	}) => {
		await mockVideoPlayer(page);
		const state = await captionRoutes(page);

		Object.assign(state.sermon, {
			videoLink: scenario.videoLink,
			youtubeVideoId: scenario.youtubeVideoId,
		});

		await page.goto('/sermons/1');

		// The page stays readable without creating a video player.
		await expect(page.locator('.SermonDetail-player')).toContainText(
			'Invalid YouTube video link',
		);
		await expect(page.getByTestId('test-video-player')).toHaveCount(0);
		await expect(
			page.getByRole('link', { name: 'Watch', exact: true }),
		).toHaveCount(0);

		// Metadata must not expose the unsafe or mismatched address.
		await expect(page.locator('.SermonDetail-metadata-link')).toHaveCount(0);
		await expect(page.locator('.SermonDetail-metadata')).toContainText(
			'Video unavailable',
		);

		await page.getByRole('button', { name: 'Timestamps', exact: true }).click();

		const transcript = page.getByRole('region', {
			name: 'Sermon transcript',
		});

		// Keep caption text and times, but remove source links.
		await expect(transcript).toContainText('Welcome to church.');
		await expect(transcript).toContainText('God is good.');
		await expect(transcript.getByRole('link')).toHaveCount(0);
		await expect(
			transcript.getByTitle('Video unavailable', { exact: true }),
		).toHaveCount(2);
	});
}

test('an older record without a stored ID still plays and seeks', async ({
	page,
}) => {
	await mockVideoPlayer(page);
	const state = await captionRoutes(page);

	// This older record has a supported short link and no stored ID.
	state.sermon.videoLink = 'https://youtu.be/F_OiCiZ3Y3Y?si=legacy';

	await page.goto('/sermons/1');

	const player = page.getByTestId('test-video-player');
	await expect(player).toBeVisible();

	// Display a canonical link built from the validated ID.
	const watchUrl = 'https://www.youtube.com/watch?v=F_OiCiZ3Y3Y';

	await expect(
		page.getByRole('link', { name: 'Watch', exact: true }),
	).toHaveAttribute('href', watchUrl);
	await expect(page.locator('.SermonDetail-metadata-link')).toHaveAttribute(
		'href',
		watchUrl,
	);

	await page.getByRole('button', { name: 'Timestamps', exact: true }).click();

	const cue = page.getByRole('link', { name: 'Watch from 0:01' });
	await expect(cue).toHaveAttribute('href', `${watchUrl}&t=1s`);

	// Embedded seeking keeps the original fractional timestamp.
	await cue.click();
	await expect(player).toHaveAttribute('data-seek-time', '1.25');
	await expect(player).toHaveAttribute('data-playing', 'true');
	expect(page.context().pages()).toHaveLength(1);
});
