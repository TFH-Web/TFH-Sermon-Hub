import { expect } from '@playwright/test';
import { test } from './fixtures';

test.beforeEach(async ({ page }) => {
	await page.goto('/series');
});

test('series are visible', async ({ page }) => {
	const cards = page.getByRole('heading', { level: 3 }).locator('..');
	await expect
		.soft(cards.getByRole('heading'))
		.toHaveText([
			'Live Your Best Life',
			'Together',
			'Fearless',
			'Hope Rising',
			'New Ground',
			'Series 1',
			'Series 2',
			'Series 3',
			'Series 4',
			'Series 5',
			'Series 6',
			'Series 7',
		]);
	await expect
		.soft(cards.getByText(/\d+ Sermons?/))
		.toHaveText([
			'2 Sermons • 2026 • Patterson',
			'1 Sermon • 2026 • Zwanziger',
			'1 Sermon • 2026 • Harris',
			'1 Sermon • 2026 • Harris',
			'0 Sermons',
			'0 Sermons',
			'0 Sermons',
			'0 Sermons',
			'0 Sermons',
			'0 Sermons',
			'0 Sermons',
			'0 Sermons',
		]);
});

test('pagination works', async ({ page }) => {
	await page.getByRole('button', { name: 'Next' }).click();
	const series8 = page.getByRole('heading', { name: 'Series 8' });
	await expect(series8).toBeVisible();
});
