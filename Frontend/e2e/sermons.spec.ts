import { expect } from '@playwright/test';
import { test } from './fixtures';

for (const { name, parameter, value, totalPages } of [
	{ name: 'status', parameter: 'status', value: 'Published', totalPages: 1, },
	{ name: 'topic', parameter: 'topic', value: 'grace', totalPages: 1 },
	{ name: 'speaker', parameter: 'speaker_id', value: '1', totalPages: 1 },
	{ name: 'series', parameter: 'series_id', value: '1', totalPages: 1 },
	{ name: 'sort', parameter: 'sort', value: 'Oldest', totalPages: 2 },
]) {
	test(`${name} resets the actual page and persists in subsequent requests`, async ({
		page,
	}) => {
		await page.goto('/sermons');
		await page.getByRole('button', { name: 'Next page' }).click();
		await expect(page.getByText('Page 2 of 2')).toBeVisible();
		await expect(page.getByText('Bold Faith', { exact: true })).toBeVisible();

		const changedRequest = page.waitForRequest(request => {
			const url = new URL(request.url());
			return (
				url.pathname === '/api/sermons' &&
				url.searchParams.get(parameter) === value
			);
		});
		if (name === 'status' || name === 'topic') {
			await page
				.locator(`label:has(input[name="${name}"][value="${value}"])`)
				.click();
		} else {
			const index = name === 'speaker' ? 0 : name === 'series' ? 1 : 2;
			await page.locator('select').nth(index).selectOption(value);
		}
		expect(new URL((await changedRequest).url()).searchParams.get('page')).toBe(
			'1',
		);
		await expect(page.getByText(`Page 1 of ${totalPages}`)).toBeVisible();
		await expect(page.getByText('Under Grace', { exact: true })).toBeVisible();
	});
}

for (const resource of ['speakers', 'series', 'tags']) {
	test(`shows a filter error when ${resource} fails and recovers on refresh`, async ({
		page,
	}) => {
		const browserErrors: string[] = [];
		page.on('pageerror', error => browserErrors.push(error.message));
		// Match by pathname so query params (e.g. tags?used=true) still hit the failure
		const failing = (url: URL) => url.pathname === `/api/${resource}`;
		await page.route(failing, route =>
			route.fulfill({
				status: 500,
				json: { error: 'Unavailable' },
			}),
		);
		await page.goto('/sermons');
		await expect(page.getByText('Failed to load sermon filters.')).toBeVisible({
			timeout: 15000,
		});
		await expect(page.locator('select').first()).toBeDisabled();
		expect(browserErrors).toEqual([]);
		await page.unroute(failing);
		await page.reload();
		await expect(page.getByText('Page 1 of 2')).toBeVisible();
	});
}

test('paged results do not replace the full library used by Dashboard', async ({
	page,
}) => {
	await page.goto('/sermons');
	await expect(page.getByText('Page 1 of 2')).toBeVisible();
	await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
	await expect(
		page.locator('.StatCard').filter({ hasText: 'Total Sermons' }),
	).toContainText('13');
});
