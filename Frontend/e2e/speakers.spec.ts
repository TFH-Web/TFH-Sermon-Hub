import { expect, test } from '@playwright/test';
import { setupRoutes } from './setup';

test.beforeEach(async ({ page }) => {
	setupRoutes(page);
	await page.goto('/speakers');
});

test('speakers are visible', async ({ page }) => {
	const davePatterson = page.getByRole('heading', { name: 'Dave Patterson' });
	await expect(
		davePatterson.locator('..').getByText('Lead Speaker • 12 sermons'),
	).toBeVisible();

	const speakers = page.getByRole('heading', { name: /Speaker No\. \d+/ });
	await expect(speakers).toHaveText([
		'Speaker No. 2',
		'Speaker No. 3',
		'Speaker No. 4',
		'Speaker No. 5',
		'Speaker No. 6',
		'Speaker No. 7',
		'Speaker No. 8',
		'Speaker No. 9',
		'Speaker No. 10',
	]);
	await expect(speakers.locator('..').getByText('Guest Speaker')).toHaveText([
		'Guest Speaker • 1 sermon',
		'Guest Speaker • 2 sermons',
		'Guest Speaker • 3 sermons',
		'Guest Speaker • 4 sermons',
		'Guest Speaker • 5 sermons',
		'Guest Speaker • 6 sermons',
		'Guest Speaker • 7 sermons',
		'Guest Speaker • 8 sermons',
		'Guest Speaker • 9 sermons',
	]);
});

test('pagination works', async ({ page }) => {
	await page.getByRole('button', { name: 'Next' }).click();
	const speaker11 = page.getByRole('heading', { name: 'Speaker No. 11' });
	await expect(speaker11).toBeVisible();
});
