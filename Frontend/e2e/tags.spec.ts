import { expect, test } from '@playwright/test';
import { setupRoutes } from './setup';

test.beforeEach(async ({ page }) => {
	setupRoutes(page);
	await page.goto('/tags');
});

test('tags are visible', async ({ page }) => {
	const tags = page.getByRole('rowheader');
	await expect(tags).toHaveText(['grace', 'tag-2', 'tag-3', 'tag-4', 'tag-5']);

	const rows = tags.locator('..');

	await expect(rows.getByRole('cell').filter({ hasText: /\d+/ })).toHaveText([
		'10',
		'10',
		'11',
		'12',
		'13',
	]);
	await expect(
		rows.getByRole('cell').filter({ hasText: /Manual|AI/ }),
	).toHaveText(['Manual', 'AI', 'AI', 'AI', 'AI']);
});

test('pagination works', async ({ page }) => {
	await page.getByRole('button', { name: 'Next' }).click();
	const tag6 = page.getByRole('rowheader', { name: 'tag-6' });
	await expect(tag6).toBeVisible();
});
