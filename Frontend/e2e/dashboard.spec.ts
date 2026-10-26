import { expect } from '@playwright/test';
import { test } from './fixtures';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
});

test('metrics work', async ({ page }) => {
	for (const { name, stat } of [
		{ name: 'Total Sermons', stat: 6 },
		{ name: 'Series', stat: 14 },
		{ name: 'Speakers', stat: 25 },
	]) {
		await test.step(`metric: ${name}`, async () => {
			const heading = page.getByRole('heading', { name });
			await expect.soft(heading).toBeVisible();

			const parent = heading.locator('..');
			await expect.soft(parent.getByText(stat.toString())).toBeVisible();
		});
	}
});

test('recent sermons are listed', async ({ page }) => {
	const rows = page.getByRole('rowheader');
	await expect(rows).toHaveText([
		'Under Grace',
		'Walking in Freedom',
		'Anchored in Hope',
		'Power of Community',
		'Worship as a Lifestyle',
	]);
});
