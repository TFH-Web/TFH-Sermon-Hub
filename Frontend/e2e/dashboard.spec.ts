import test, { expect, type Page } from '@playwright/test';
import { seriess, sermons, speakers } from './data';
import { setupRoutes } from './setup';

const recentSermons = sermons
	.map(sermon => ({
		...sermon,
		// Exercise the API's ID tie-breaker for sermons preached on the same date.
		date: sermon.id === 9 ? '2026-02-19' : sermon.date,
	}))
	.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
	.slice(0, 5);

async function setupDashboardRoutes(page: Page) {
	await setupRoutes(page);
	await page.route(
		url =>
			['/api/sermons', '/api/series', '/api/speakers'].includes(url.pathname),
		async route => {
			switch (new URL(route.request().url()).pathname) {
				case '/api/sermons':
					return route.fulfill({
						json: {
							items: recentSermons,
							total: 450,
							page: 1,
							pageSize: 5,
							totalPages: 90,
						},
					});
				case '/api/series':
					return route.fulfill({
						json: {
							items: seriess.slice(0, 1),
							total: 71,
							page: 1,
							perPage: 1,
						},
					});
				case '/api/speakers':
					return route.fulfill({
						json: {
							items: speakers.slice(0, 1),
							total: 37,
							page: 1,
							pageSize: 1,
							totalPages: 37,
						},
					});
			}
		},
	);
}

test.beforeEach(async ({ page }) => {
	await setupDashboardRoutes(page);
});

test('metrics work', async ({ page }) => {
	const requests = ['/api/sermons', '/api/series', '/api/speakers'].map(path =>
		page.waitForRequest(request => new URL(request.url()).pathname === path),
	);
	await page.goto('/');
	const [sermonRequest, seriesRequest, speakerRequest] =
		await Promise.all(requests);
	expect(Object.fromEntries(new URL(sermonRequest.url()).searchParams)).toEqual(
		{
			page: '1',
			pageSize: '5',
			sort: 'Newest',
		},
	);
	expect(Object.fromEntries(new URL(seriesRequest.url()).searchParams)).toEqual(
		{
			page: '1',
			per_page: '1',
		},
	);
	expect(
		Object.fromEntries(new URL(speakerRequest.url()).searchParams),
	).toEqual({
		page: '1',
		pageSize: '1',
	});

	for (const { name, stat } of [
		{ name: 'Total Sermons', stat: 450 },
		{ name: 'Series', stat: 71 },
		{ name: 'Speakers', stat: 37 },
	]) {
		await test.step(`metric: ${name}`, async () => {
			const heading = page.getByRole('heading', { name });
			await expect(heading).toBeVisible();

			const parent = heading.locator('..');
			await expect(parent.getByText(stat.toString())).toBeVisible();
		});
	}
});

test('recent sermons are listed', async ({ page }) => {
	await page.goto('/');
	const rows = page.getByRole('rowheader').filter({ hasText: /Sermon \d+/ });
	await expect(rows).toHaveText([
		'Sermon 10',
		'Sermon 9',
		'Sermon 8',
		'Sermon 7',
		'Sermon 6',
	]);
});

// What the dashboard listed before: made-up imports and activity entries.
const sampleText = [
	'Batch Import YouTube Library',
	'Sermon Notes 2024 Archive',
	'Vimeo Import Legacy Content',
	'Under Grace',
	'Walking in Freedom',
	'Bold Faith',
	'Email sent',
];

test('activity cards show unavailable states instead of sample data', async ({
	page,
}) => {
	await page.goto('/');

	await expect(
		page.getByText('Import activity not available yet'),
	).toBeVisible();
	await expect(
		page.getByText('Activity history not available yet'),
	).toBeVisible();
	// Only look for the sample entries once the page has settled, or their absence proves nothing.
	for (const text of sampleText) {
		await expect(page.getByText(text)).toHaveCount(0);
	}
});
