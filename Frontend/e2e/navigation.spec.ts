import { devices, expect, test } from '@playwright/test';

test('navigation works', async ({ page }) => {
	await page.goto('/');

	for (const pageName of [
		'Sermons',
		'Series',
		'Speakers',
		'AI Search',
		'Import / Upload',
		'Tags & Metadata',
		'User Management',
		'Notifications',
		'Settings',
		'Dashboard',
	]) {
		await test.step(`Navigate to ${pageName}`, async () => {
			await page.getByRole('link', { name: pageName }).click();
			await expect(
				page.getByRole('heading', { name: pageName, exact: true }),
			).toBeVisible();
		});
	}
});

test('sidebar controls work on mobile', async ({ page }) => {
	await page.setViewportSize(devices['iPhone XR'].viewport);
	await page.goto('/');

	const getSidebar = () => page.getByRole('heading', { name: 'Sermon Hub' });

	await expect(getSidebar()).not.toBeInViewport();

	await test.step('Open sidebar', async () => {
		await page.getByTestId('sidebar-toggle-label').click();
		await expect(getSidebar()).toBeInViewport();
	});

	await test.step('Navigate with links', async () => {
		await page.getByRole('link', { name: 'Dashboard' }).click();
		await expect(getSidebar()).toBeInViewport();

		await page.getByRole('link', { name: 'AI Search' }).click();
		await expect(getSidebar()).not.toBeInViewport();
	});

	await test.step('Close sidebar with X and backdrop', async () => {
		await page.getByTestId('sidebar-toggle-label').click();
		await page.getByTestId('sidebar-close').click();
		await expect(getSidebar()).not.toBeInViewport();

		await page.getByTestId('sidebar-toggle-label').click();
		await page.getByTestId('sidebar-backdrop').click();
		await expect(getSidebar()).not.toBeInViewport();
	});
});
