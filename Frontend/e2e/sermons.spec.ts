import { expect, test } from '@playwright/test';

const speaker = {
	id: 1,
	firstName: 'Dave',
	lastName: 'Patterson',
	role: 'Lead Speaker',
};
const series = { id: 1, title: 'Grace Series' };
const tag = { name: 'grace', source: 'manual', count: 10 };
const sermons = Array.from({ length: 10 }, (_, index) => ({
	id: index + 1,
	title: `Sermon ${index + 1}`,
	videoLink: 'https://youtu.be/example',
	duration: 1200,
	date: '2026-02-23',
	description: 'A message about grace.',
	tags: [tag],
	speaker,
	series,
	status: 'Published',
}));

test.beforeEach(async ({ page }) => {
	await page.route('**/api/*', async route => {
		const url = new URL(route.request().url());
		switch (url.pathname) {
			case '/api/speakers':
				return route.fulfill({ json: [speaker] });
			case '/api/series':
				return route.fulfill({ json: [series] });
			case '/api/tags':
				return route.fulfill({ json: [tag] });
			case '/api/sermons': {
				if (!url.searchParams.has('page'))
					return route.fulfill({ json: sermons });
				const currentPage = Number(url.searchParams.get('page'));
				const pageSize = Number(url.searchParams.get('pageSize'));
				return route.fulfill({
					json: {
						items: sermons.slice(
							(currentPage - 1) * pageSize,
							currentPage * pageSize,
						),
						total: sermons.length,
						page: currentPage,
						pageSize,
						totalPages: Math.ceil(sermons.length / pageSize),
					},
				});
			}
			default:
				return route.abort();
		}
	});
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
		await expect(
			page.getByText(
				'Failed to load sermon filters. Refresh the page and try again.',
			),
		).toBeVisible({ timeout: 15000 });
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
	).toContainText('10');
});
