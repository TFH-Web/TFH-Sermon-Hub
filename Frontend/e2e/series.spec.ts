import { expect, test } from '@playwright/test';
import { setupRoutes } from './setup';

test.beforeEach(async ({ page }) => {
	setupRoutes(page);
	await page.goto('/series');
});

test('series are visible', async ({ page }) => {
	const cards = page
		.getByRole('heading', { name: /Grace Series|Series \d/ })
		.locator('..');
	await expect(cards.getByRole('heading')).toHaveText([
		'Grace Series',
		'Series 2',
		'Series 3',
		'Series 4',
		'Series 5',
		'Series 6',
		'Series 7',
		'Series 8',
		'Series 9',
		'Series 10',
	]);
	await expect(cards.getByText(/\d+ Sermons?/)).toHaveText([
		'12 Sermons • 2026 • Patterson',
		'1 Sermon • 2026 • Multiple speakers',
		'2 Sermons • 2026 • Multiple speakers',
		'3 Sermons • 2026 • Multiple speakers',
		'4 Sermons • 2026 • Multiple speakers',
		'5 Sermons • 2026 • Multiple speakers',
		'6 Sermons • 2026 • Multiple speakers',
		'7 Sermons • 2026 • Multiple speakers',
		'8 Sermons • 2026 • Multiple speakers',
		'9 Sermons • 2026 • Multiple speakers',
	]);
});

test('pagination works', async ({ page }) => {
	await page.getByRole('button', { name: 'Next' }).click();
	const series11 = page.getByRole('heading', { name: 'Series 11' });
	await expect(series11).toBeVisible();
});
