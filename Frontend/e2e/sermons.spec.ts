import { expect, test } from '@playwright/test';
import { sermons } from './data';
import { setupRoutes } from './setup';

test.beforeEach(async ({ page }) => {
	setupRoutes(page);
});

for (const { name, parameter, value } of [
	{ name: 'status', parameter: 'status', value: 'Published' },
	{ name: 'topic', parameter: 'topic', value: 'grace' },
	{ name: 'speaker', parameter: 'speaker_id', value: '1' },
	{ name: 'series', parameter: 'series_id', value: '1' },
	{ name: 'sort', parameter: 'sort', value: 'Oldest' },
]) {
	test(`${name} resets the actual page and persists in subsequent requests`, async ({
		page,
	}) => {
		await page.goto('/sermons');
		await page.getByRole('button', { name: 'Next page' }).click();
		await expect(page.getByText('Page 2 of 2')).toBeVisible();
		await expect(page.getByText('Sermon 10', { exact: true })).toBeVisible();

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
		await expect(page.getByText('Page 1 of 2')).toBeVisible();
		await expect(page.getByText('Sermon 1', { exact: true })).toBeVisible();

		const nextRequest = page.waitForRequest(request => {
			const url = new URL(request.url());
			return (
				url.pathname === '/api/sermons' && url.searchParams.get('page') === '2'
			);
		});
		await page.getByRole('button', { name: 'Next page' }).click();
		expect(new URL((await nextRequest).url()).searchParams.get(parameter)).toBe(
			value,
		);
		await expect(page.getByText('Page 2 of 2')).toBeVisible();
		if (name === 'status' || name === 'topic') {
			await expect(
				page.locator(`input[name="${name}"][value="${value}"]`),
			).toBeChecked();
		} else {
			await expect(
				page
					.locator('select')
					.nth(name === 'speaker' ? 0 : name === 'series' ? 1 : 2),
			).toHaveValue(value);
		}
		await page.getByRole('button', { name: 'Previous page' }).click();
		await expect(page.getByText('Page 1 of 2')).toBeVisible();
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

test('Dashboard keeps full totals separate from paged sermon results', async ({
	page,
}) => {
	await page.goto('/sermons');
	await expect(page.getByText('Page 1 of 2')).toBeVisible();
	// Keep the legacy list fixture unchanged; only the destination dashboard gets
	// a bounded response with a full-library total larger than either page's items.
	await page.route(
		url => url.pathname === '/api/sermons',
		route =>
			route.fulfill({
				json: {
					items: [...sermons]
						.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
						.slice(0, 5),
					total: 450,
					page: 1,
					pageSize: 5,
					totalPages: 90,
				},
			}),
	);
	const dashboardRequest = page.waitForRequest(
		request => new URL(request.url()).pathname === '/api/sermons',
	);
	await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
	expect(
		Object.fromEntries(new URL((await dashboardRequest).url()).searchParams),
	).toEqual({ page: '1', pageSize: '5', sort: 'Newest' });
	await expect(
		page.locator('.StatCard').filter({ hasText: 'Total Sermons' }),
	).toContainText('450');
	await expect(page.getByRole('rowheader')).toHaveText([
		'Sermon 10',
		'Sermon 9',
		'Sermon 8',
		'Sermon 7',
		'Sermon 6',
	]);
});
