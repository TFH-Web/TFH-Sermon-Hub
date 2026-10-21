import { expect, type Page, test } from '@playwright/test';

// The same video and timestamp as Backend/tests/test_chat_citations.py.
const source = {
	source_id: 1,
	chunk_id: 10,
	sermon_id: 7,
	title: 'Under Grace',
	youtube_video_id: 'JQSUGFQO5FU',
	start_sec: 75,
	end_sec: 90,
	url: 'https://www.youtube.com/watch?v=JQSUGFQO5FU&t=75s',
};

// Example API answer used by the tests.
const answer = {
	answer: 'Grace is a gift.',
	ai_generated: true,
	supported: true,
	sources: [source],
};

// Match chat requests by path so a query string would not matter.
const isChat = (url: URL) => url.pathname === '/api/chat';

const placeholder =
	'Ask anything about sermons, speakers, topics, or scripture...';
const question = 'What is grace?';
const followUp = 'Tell me more';

// Open the chat with every question answered by the example answer.
async function openChat(page: Page) {
	await page.route(isChat, route => route.fulfill({ json: answer }));
	await page.goto('/ai-chat');
}

async function ask(page: Page, text: string) {
	await page.getByPlaceholder(placeholder).fill(text);
	await page.getByRole('button', { name: 'Send', exact: true }).click();
}

test('asks a question and opens the cited timestamp', async ({ page }) => {
	await openChat(page);
	const requestPromise = page.waitForRequest(request =>
		isChat(new URL(request.url())),
	);

	await ask(page, question);

	// The question reaches the API with no sermon selected and no earlier turns.
	const request = await requestPromise;
	expect(request.method()).toBe('POST');
	expect(request.postDataJSON()).toEqual({
		message: question,
		sermonId: null,
		history: [],
	});

	// The answer, its label and its source with the time range are shown.
	await expect(page.getByText(answer.answer)).toBeVisible();
	await expect(page.getByText('AI generated')).toBeVisible();
	const link = page.getByRole('link', { name: /Under Grace/ });
	await expect(link).toContainText('1:15–1:30');
	await expect(link).toHaveAttribute('href', source.url);

	// Stub YouTube so following the citation never reaches the real site.
	await page.context().route('https://www.youtube.com/**', route =>
		route.fulfill({
			contentType: 'text/html',
			body: '<title>Stub video</title>',
		}),
	);
	const opened = page.context().waitForEvent('page');
	await link.click();

	// The citation opens the video at the cited second.
	await expect(await opened).toHaveURL(source.url);
});

test('retries a failed question without duplicating it', async ({ page }) => {
	// Fail the first request, then allow the retry to succeed.
	let shouldFail = true;
	const bodies: unknown[] = [];

	await page.route(isChat, route => {
		bodies.push(route.request().postDataJSON());

		return shouldFail
			? route.fulfill({ status: 500, json: { error: 'Chat unavailable' } })
			: route.fulfill({ json: answer });
	});
	await page.goto('/ai-chat');

	await ask(page, question);

	await expect(page.getByRole('alert')).toContainText('Chat unavailable');
	await expect(page.getByText(answer.answer)).toHaveCount(0);

	shouldFail = false;
	await page.getByRole('button', { name: 'Retry', exact: true }).click();

	// A successful retry replaces the error with the answer.
	await expect(page.getByText(answer.answer)).toBeVisible();
	await expect(page.locator('.ErrorBox')).toHaveCount(0);

	// The retry sent the same request, and the question was only added once.
	expect(bodies).toHaveLength(2);
	expect(bodies[1]).toEqual(bodies[0]);
	await expect(page.getByText(question, { exact: true })).toHaveCount(1);
});

test('keeps the conversation across in-app navigation and clears it on refresh', async ({
	page,
}) => {
	await openChat(page);
	await ask(page, question);
	await expect(page.getByText(answer.answer)).toBeVisible();

	// The navbar uses client-side routing, so the conversation must survive it.
	await page.getByRole('link', { name: 'AI Search', exact: true }).click();
	await expect(page).toHaveURL(/\/ai-search$/);
	await page.getByRole('link', { name: 'AI Chat', exact: true }).click();
	await expect(page).toHaveURL(/\/ai-chat$/);

	await expect(page.getByText(question, { exact: true })).toBeVisible();
	await expect(page.getByText(answer.answer)).toBeVisible();

	// A reload is a new page load, which forgets the in-memory conversation.
	await page.reload();

	await expect(page.getByText('Ask about any sermon')).toBeVisible();
	await expect(page.getByText(answer.answer)).toHaveCount(0);
});

test("keeps a cited sermon's conversation separate from the general one", async ({
	page,
}) => {
	await openChat(page);
	await ask(page, question);

	// Ask about the cited sermon from its source card.
	await page.getByTitle('Ask AI about "Under Grace"').click();

	await expect(page).toHaveURL(/\/ai-chat\?sermonId=7&title=Under\+Grace$/);
	await expect(page.getByText(/ready to answer questions about/)).toBeVisible();

	// A question in that chat is scoped to the sermon.
	const sermonRequest = page.waitForRequest(
		request =>
			isChat(new URL(request.url())) &&
			request.postDataJSON()?.sermonId === 7,
	);
	await ask(page, followUp);
	await sermonRequest;
	await expect(page.getByText(answer.answer)).toBeVisible();

	// Back in the general chat, only its own conversation is shown.
	await page.getByRole('link', { name: 'AI Chat', exact: true }).click();

	await expect(page).toHaveURL(/\/ai-chat$/);
	await expect(page.getByText(question, { exact: true })).toBeVisible();
	await expect(page.getByText(answer.answer)).toHaveCount(1);
	await expect(page.getByText(followUp, { exact: true })).toHaveCount(0);
	await expect(page.getByText(/ready to answer questions about/)).toHaveCount(0);
});
