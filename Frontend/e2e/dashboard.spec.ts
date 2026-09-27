import test, { expect } from '@playwright/test';
import { setupRoutes } from './setup';

test.beforeEach(async ({ page }) => {
	setupRoutes(page);
	await page.goto('/');
});

test('metrics work', async ({ page }) => {
	for (const { name, stat } of [
		{ name: 'Total Sermons', stat: 10 },
		{ name: 'Series', stat: 15 },
		{ name: 'Speakers', stat: 15 },
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
	const rows = page.getByRole('rowheader').filter({ hasText: /Sermon \d+/ });
	await expect(rows).toHaveText([
		'Sermon 10',
		'Sermon 9',
		'Sermon 8',
		'Sermon 7',
		'Sermon 6',
	]);
});
