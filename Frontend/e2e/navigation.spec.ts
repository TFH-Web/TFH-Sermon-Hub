import { expect, test } from '@playwright/test';

test('navigation works', async ({ page }) => {
	await page.goto('/');

	for (const pageName of [
		'Sermons',
		'Series',
		'Speakers',
		'AI Search',
		'Import / Upload',
		'Tags & Metadata',
		'Transcripts',
		'User Management',
		'Notifications',
		'Settings',
		'Dashboard',
	]) {
		await test.step(`Navigate to ${pageName}`, async () => {
			await page.getByRole('link', { name: pageName }).click();
			await expect(page.getByRole('heading', { name: pageName, exact: true })).toBeVisible();
		});
	}
});
