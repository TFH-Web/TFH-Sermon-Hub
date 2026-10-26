import { expect, test } from '@playwright/test';

const videoId = 'e2eGrace001';
const title = 'Grace for the Journey';

test('imports, processes, searches and cites the persisted sermon through Flask', async ({
	page,
}) => {
	// API calls are continued to the Vite proxy and real Flask server. No business
	// response is fulfilled in Playwright. External embeds/icons/identity are offline.
	await page.route('**/*', route => {
		const url = new URL(route.request().url());
		return url.origin === 'http://127.0.0.1:5360'
			? route.continue()
			: route.abort('blockedbyclient');
	});
	await page.goto('/upload');
	await page.locator('.Header-upload').click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('YouTube link').fill(`https://youtu.be/${videoId}`);
	const importedResponse = page.waitForResponse(
		response =>
			response.url().endsWith('/api/import/youtube/video') &&
			response.request().method() === 'POST',
	);
	await dialog.getByRole('button', { name: 'Import & Process' }).click();
	const imported = await importedResponse;
	expect(imported.status()).toBe(201);
	expect(imported.headers()['x-tfh-e2e']).toBe('real-flask');
	const sermon = await imported.json();
	expect(sermon).toMatchObject({
		title,
		status: 'Published',
		youtubeVideoId: videoId,
	});
	expect(sermon.id).toBeGreaterThan(0);
	await dialog.getByRole('button', { name: 'Open sermon' }).click();
	await expect(page).toHaveURL(new RegExp(`/sermons/${sermon.id}$`));
	await expect(
		page.getByRole('heading', { name: title, exact: true, level: 1 }),
	).toBeVisible();
	const transcript = await page.request.get(
		`/api/sermons/${sermon.id}/transcript`,
	);
	expect(transcript.ok()).toBe(true);
	expect(await transcript.json()).toMatchObject({
		transcript: expect.stringContaining('Grace is freely given'),
		segments: [
			{
				start: 75.5,
				end: 91.25,
				text: expect.stringContaining('Grace is freely given'),
			},
		],
	});

	await page.goto('/ai-search');
	await page
		.getByPlaceholder('e.g. What has Dave said about overcoming anxiety?')
		.fill('grace');
	const searched = page.waitForResponse(
		response =>
			new URL(response.url()).pathname === '/api/search' &&
			response.request().method() === 'GET',
	);
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	const search = await searched;
	expect(search.ok()).toBe(true);
	expect(search.headers()['x-tfh-e2e']).toBe('real-flask');
	const results = await search.json();
	expect(results.total).toBe(1);
	expect(results.items).toEqual([
		expect.objectContaining({
			id: sermon.id,
			sermonId: sermon.id,
			title,
			start_sec: 75.5,
			snippet: expect.stringContaining('Grace is freely given'),
		}),
	]);
	await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
	// Follow the real API source through the actual search card to the player route.
	await page.locator('.AISearchPreviewCard-open').click();
	await expect(page).toHaveURL(
		`http://127.0.0.1:5360/sermons/${sermon.id}?t=75.5`,
	);
	await expect(
		page.getByRole('heading', { name: title, exact: true, level: 1 }),
	).toBeVisible();

	await page.goto('/ai-chat');
	await page
		.getByPlaceholder(
			'Ask anything about sermons, speakers, topics, or scripture...',
		)
		.fill('What does this sermon say about grace?');
	const answered = page.waitForResponse(
		response =>
			new URL(response.url()).pathname === '/api/chat' &&
			response.request().method() === 'POST',
	);
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	const chat = await answered;
	expect(chat.ok()).toBe(true);
	expect(chat.headers()['x-tfh-e2e']).toBe('real-flask');
	const answer = await chat.json();
	expect(answer).toMatchObject({ supported: true, ai_generated: true });
	expect(answer.answer).toContain('Grace is freely given');
	expect(answer.sources).toEqual([
		expect.objectContaining({
			sermon_id: sermon.id,
			title,
			start_sec: 75.5,
			url: `https://www.youtube.com/watch?v=${videoId}&t=75s`,
		}),
	]);
	await expect(page.getByText('AI generated', { exact: true })).toBeVisible();
	await expect(
		page.getByRole('link', { name: new RegExp(title) }),
	).toHaveAttribute('href', answer.sources[0].url);
	await expect(
		page.getByText('Grace is freely given to everyone who asks [1].', {
			exact: true,
		}),
	).toBeVisible();

	// This also proves the transcript/chunks/vectors were written by the pipeline,
	// and the grounded prompt used those records rather than a mocked chat response.
	const proofResponse = await page.request.get('/__e2e__/proof');
	const proof = await proofResponse.json();
	expect(proof).toMatchObject({
		sermons: 1,
		chunks: 1,
		vectors: 1,
		calls: { youtube: 1, captions: 1, summary: 1, tags: 1, chat: 1 },
	});
	expect(proof.calls.embeddings).toBeGreaterThanOrEqual(3);
	expect(proof.sqlite_vec).toMatch(/^v?0\./);
});
