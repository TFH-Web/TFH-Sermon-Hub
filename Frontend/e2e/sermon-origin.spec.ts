// Tests for calendar dates and truthful AI-origin labels on the sermon detail page, including save and regeneration outcomes.
import { expect, type Page, test } from '@playwright/test';
import { sermons } from './data';

const QUEUE_UNAVAILABLE =
	'The job queue is unavailable. Please try again later.';

interface DetailState {
	sermon: Record<string, unknown>;
	// Request bodies of the summary saves, in order.
	saves: unknown[];
	regeneration: 'succeeds' | 'fails';
}

async function detailRoutes(
	page: Page,
	overrides: Record<string, unknown> = {},
) {
	const state: DetailState = {
		sermon: {
			...sermons[0],
			// Too short to be a video ID, so no player loads and these tests stay on the page's own text.
			videoLink: 'https://youtu.be/example',
			summary: 'A saved summary.',
			summarySource: 'manual',
			tags: [],
			...overrides,
		},
		saves: [],
		regeneration: 'succeeds',
	};

	await page.route('**/api/**', async route => {
		const request = route.request();
		const path = new URL(request.url()).pathname;

		if (path === '/api/sermons') {
			return route.fulfill({ json: [state.sermon] });
		}
		if (path === '/api/sermons/1/transcript') {
			return route.fulfill({ json: { transcript: null, segments: [] } });
		}
		if (path === '/api/sermons/1/regenerate-summary') {
			if (state.regeneration === 'fails') {
				return route.fulfill({
					status: 503,
					json: { error: QUEUE_UNAVAILABLE, message: QUEUE_UNAVAILABLE },
				});
			}
			Object.assign(state.sermon, {
				summary: 'A new generated summary.',
				summarySource: 'ai',
			});
			return route.fulfill({ status: 202, json: state.sermon });
		}
		if (path === '/api/sermons/1') {
			if (request.method() === 'PATCH') {
				const body = request.postDataJSON() as { summary: string };
				state.saves.push(body);

				// Explicit saves establish manual origin; empty content has no origin.
				state.sermon.summary = body.summary;
				state.sermon.summarySource = body.summary.trim() ? 'manual' : null;
			}
			return route.fulfill({ json: state.sermon });
		}
		return route.abort();
	});

	return state;
}

// A date read as midnight UTC is the day before in a zone behind UTC, so one zone behind and the furthest zone ahead (UTC+14) both run.
for (const timezoneId of ['America/Los_Angeles', 'Pacific/Kiritimati']) {
	test.describe(`in ${timezoneId}`, () => {
		test.use({ timezoneId });

		test('the detail page shows the saved calendar day', async ({ page }) => {
			// The 1st of a month is the day that slips into the month before.
			await detailRoutes(page, { date: '2026-03-01' });
			await page.goto('/sermons/1');

			await expect(page.locator('.SermonDetail-meta')).toContainText(
				'Mar 1, 2026',
			);
			await expect(page.locator('.SermonDetail-metadata')).toContainText(
				'March 1, 2026',
			);
		});
	});
}

test('the Metadata card counts saved AI and manual tags separately', async ({
	page,
}) => {
	await detailRoutes(page, {
		tags: [
			{ name: 'grace', source: 'ai' },
			{ name: 'hope', source: 'ai' },
			{ name: 'faith', source: 'manual' },
		],
	});
	await page.goto('/sermons/1');

	const metadata = page.locator('.SermonDetail-metadata');
	await expect(metadata).toContainText('AI Generated (2)');
	await expect(metadata).toContainText('Manual (1)');
});

for (const source of ['ai', 'manual', null]) {
	test(`the Metadata card does not claim an origin when the summary origin is ${source ?? 'unknown'}`, async ({
		page,
	}) => {
		// Manual-only tags keep tag labels from being mistaken for a summary label.
		await detailRoutes(page, {
			summarySource: source,
			tags: [{ name: 'faith', source: 'manual' }],
		});
		await page.goto('/sermons/1');

		// Having a summary says nothing about who wrote it.
		const metadata = page.locator('.SermonDetail-metadata');
		await expect(metadata).toContainText('Available');
		await expect(metadata).not.toContainText('AI Generated');
	});
}

for (const scenario of [
	{ name: 'AI', source: 'ai', labels: 1 },
	{ name: 'manual', source: 'manual', labels: 0 },
	{ name: 'unknown', source: null, labels: 0 },
]) {
	test(`a saved edit to a ${scenario.name}-origin summary shows the right label`, async ({
		page,
	}) => {
		const state = await detailRoutes(page, { summarySource: scenario.source });
		await page.goto('/sermons/1');

		// Scope the check to the summary, excluding unrelated AI tag labels.
		const summary = page.locator('.SermonDetail-summary');
		const label = summary.getByText('AI Generated', { exact: true });
		await expect(label).toHaveCount(scenario.labels);

		await summary
			.getByRole('button', { name: 'Edit Summary Manually', exact: true })
			.click();
		await summary.getByRole('textbox').fill('Edited by staff.');
		await summary.getByRole('button', { name: 'Save', exact: true }).click();

		// A successful explicit manual save removes the generated label.
		await expect(summary).toContainText('Edited by staff.');
		await expect(label).toHaveCount(0);

		// The page sends only the text, so the server alone decides the origin.
		expect(state.saves).toEqual([{ summary: 'Edited by staff.' }]);
	});
}

// Regeneration keeps content and origin consistent with the server response.
test('regenerating a manual summary shows the new text with an AI label', async ({
	page,
}) => {
	await detailRoutes(page, {
		summary: 'Staff wrote this.',
		summarySource: 'manual',
	});
	await page.goto('/sermons/1');

	const summary = page.locator('.SermonDetail-summary');
	const label = summary.getByText('AI Generated', { exact: true });
	await expect(summary).toContainText('Staff wrote this.');
	await expect(label).toHaveCount(0);

	await summary
		.getByRole('button', { name: 'Regenerate with AI', exact: true })
		.click();

	await expect(summary).toContainText('A new generated summary.');
	await expect(label).toHaveCount(1);
});

test('a failed regeneration keeps the saved summary and adds no AI label', async ({
	page,
}) => {
	const state = await detailRoutes(page, {
		summary: 'Staff wrote this.',
		summarySource: 'manual',
	});
	state.regeneration = 'fails';
	await page.goto('/sermons/1');

	const summary = page.locator('.SermonDetail-summary');
	const label = summary.getByText('AI Generated', { exact: true });

	await summary
		.getByRole('button', { name: 'Regenerate with AI', exact: true })
		.click();

	// Wait for the error first, so the checks below run after the request has failed.
	await expect(
		page.getByText(QUEUE_UNAVAILABLE, { exact: true }),
	).toBeVisible();
	await expect(summary).toContainText('Staff wrote this.');
	await expect(summary).not.toContainText('A new generated summary.');
	await expect(label).toHaveCount(0);
});
