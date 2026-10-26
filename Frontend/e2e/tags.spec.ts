import { expect } from '@playwright/test';
import { test } from './fixtures';

test.beforeEach(async ({ page }) => {
	await page.goto('/tags');
});

test('tags are visible', async ({ page }) => {
	const tags = page.getByRole('rowheader');
	await expect.soft(tags).toHaveText([
		'anxiety',
		'faith',
		'fear',
		'grace',
		'healing',
	]);

	const rows = tags.locator('..');

	await expect.soft(rows.getByRole('cell').filter({ hasText: /\d+/ })).toHaveText([
		'1',
		'4',
		'0',
		'3',
		'2',
	]);
	await expect.soft(
		rows.getByRole('cell').filter({ hasText: /Manual|AI/ }),
	).toHaveText(['Manual', 'AI', 'Manual', 'AI', 'AI']);
});

test('pagination works', async ({ page }) => {
	await page.getByRole('button', { name: 'Next' }).click();
	const tag6 = page.getByRole('rowheader', { name: 'hope' });
	await expect(tag6).toBeVisible();
});
