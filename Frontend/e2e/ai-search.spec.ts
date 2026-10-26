import { expect, test } from '@playwright/test';

// Example API result used by the tests.
const result = {
	id: 1,
	sermonId: 42,
	title: 'Faith Over Fear',
	type: 'sermon',
	speaker: 'Dave Patterson',
	date: '2026-09-27',
	series: 'Faith Series',
	summary: 'Trusting God when anxiety feels overwhelming.',
	ai_score: 0.97,
	thumbnailUrl:
		'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
};

// Match search requests even when they contain query parameters.
const isSearch = (url: URL) => url.pathname === '/api/search';

const inputPlaceholder = 'e.g. What has Dave said about overcoming anxiety?';

test('submits filters and displays highlighted search results', async ({
	page,
}) => {
	// Return a mocked response instead of calling Flask.
	await page.route(isSearch, route => route.fulfill({ json: [result] }));

	await page.goto('/ai-search');
	await expect(page.locator('.AISearchPreviewCard')).toHaveCount(0);

	// Enter a query and choose filters before submitting.
	await page.getByPlaceholder(inputPlaceholder).fill('anxiety');
	await page
		.locator('.SearchFilters-pills')
		.getByRole('button', { name: 'Sermons', exact: true })
		.click();
	await page.locator('.SearchFilters-select').selectOption('Dave Patterson');
	await page.locator('.SearchDateDropdown-trigger').click();
	await page
		.locator('.SearchDateDropdown-options')
		.getByRole('button', { name: '7 Days', exact: true })
		.click();

	const requestPromise = page.waitForRequest(request =>
		isSearch(new URL(request.url())),
	);

	await page.getByRole('button', { name: 'Search', exact: true }).click();

	// Check that the entered query and selected filters reached the API.
	const url = new URL((await requestPromise).url());
	expect(url.searchParams.get('q')).toBe('anxiety');
	expect(url.searchParams.get('type')).toBe('sermon');
	expect(url.searchParams.get('speaker')).toBe('Dave Patterson');
	expect(url.searchParams.get('date')).toBe('7d');
	expect(url.searchParams.get('page')).toBe('1');
	expect(url.searchParams.get('pageSize')).toBe('6');

	// Check the returned metadata and highlighted snippet word.
	const card = page.locator('.AISearchPreviewCard');
	await expect(card.getByRole('heading', { name: result.title })).toBeVisible();
	await expect(card).toContainText(result.speaker);
	await expect(card).toContainText(result.date);
	await expect(card).toContainText(result.series);
	await expect(card).toContainText('97% match');
	await expect(card.locator('mark')).toHaveText('anxiety');
});

test('requests pages and resets pagination when the search changes', async ({
	page,
}) => {
	// Return a paginated response for the requested page.
	await page.route(isSearch, route => {
		const url = new URL(route.request().url());
		const currentPage = Number(url.searchParams.get('page') ?? 1);

		return route.fulfill({
			json: {
				items: [
					{
						...result,
						id: currentPage,
						title: `Result on page ${currentPage}`,
					},
				],
				page: currentPage,
				pageSize: 6,
				total: 7,
				totalPages: 2,
			},
		});
	});

	await page.goto('/ai-search');
	await page.getByPlaceholder(inputPlaceholder).fill('anxiety');
	await page.getByRole('button', { name: 'Search', exact: true }).click();

	await expect(page.getByText('Page 1 of 2')).toBeVisible();
	await page.getByRole('button', { name: 'Next page' }).click();
	await expect(page.getByText('Page 2 of 2')).toBeVisible();
	await expect(
		page.getByRole('heading', { name: 'Result on page 2' }),
	).toBeVisible();

	// Changing a content filter must request page one.
	const filterRequest = page.waitForRequest(request => {
		const url = new URL(request.url());
		return isSearch(url) && url.searchParams.get('type') === 'transcript';
	});

	await page
		.locator('.SearchFilters-pills')
		.getByRole('button', { name: 'Transcripts', exact: true })
		.click();

	const filterUrl = new URL((await filterRequest).url());
	expect(filterUrl.searchParams.get('page')).toBe('1');
	expect(filterUrl.searchParams.get('q')).toBe('anxiety');
	await expect(page.getByText('Page 1 of 2')).toBeVisible();

	// Page navigation must preserve the selected filter.
	const nextRequest = page.waitForRequest(request => {
		const url = new URL(request.url());
		return isSearch(url) && url.searchParams.get('page') === '2';
	});

	await page.getByRole('button', { name: 'Next page' }).click();
	expect(new URL((await nextRequest).url()).searchParams.get('type')).toBe(
		'transcript',
	);
	await expect(page.getByText('Page 2 of 2')).toBeVisible();

	// Submitting a different query must also request page one.
	const queryRequest = page.waitForRequest(request => {
		const url = new URL(request.url());
		return isSearch(url) && url.searchParams.get('q') === 'hope';
	});

	await page.getByPlaceholder(inputPlaceholder).fill('hope');
	await page.getByRole('button', { name: 'Search', exact: true }).click();

	expect(new URL((await queryRequest).url()).searchParams.get('page')).toBe(
		'1',
	);
	await expect(page.getByText('Page 1 of 2')).toBeVisible();
});

test('shows loading and then an empty result message', async ({ page }) => {
	// Hold the response until the loading message has been checked.
	let releaseResponse!: () => void;
	const responseGate = new Promise<void>(resolve => {
		releaseResponse = resolve;
	});

	await page.route(isSearch, async route => {
		await responseGate;
		await route.fulfill({ json: [] });
	});

	await page.goto('/ai-search');
	await page.getByPlaceholder(inputPlaceholder).fill('unknown topic');
	await page.getByRole('button', { name: 'Search', exact: true }).click();

	try {
		await expect(page.getByRole('status')).toContainText('Loading...');
	} finally {
		releaseResponse();
	}

	// An empty response should show a message and no result cards.
	await expect(
		page.getByText(
			'No results found. Try another query or change your filters.',
		),
	).toBeVisible();
	await expect(page.locator('.AISearchPreviewCard')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
});

test('shows a request error and recovers when Retry is clicked', async ({
	page,
}) => {
	// Fail the first request, then allow the retry to succeed.
	let shouldFail = true;

	await page.route(isSearch, route =>
		shouldFail
			? route.fulfill({
					status: 500,
					json: { error: 'Search unavailable' },
				})
			: route.fulfill({ json: [result] }),
	);

	await page.goto('/ai-search');
	await page.getByPlaceholder(inputPlaceholder).fill('anxiety');
	await page.getByRole('button', { name: 'Search', exact: true }).click();

	await expect(page.getByRole('alert')).toContainText(
		'Unable to search sermons. Please try again.',
	);
	await expect(page.locator('.AISearchPreviewCard')).toHaveCount(0);

	shouldFail = false;
	await page.getByRole('button', { name: 'Retry', exact: true }).click();

	// Successful retry should replace the error with returned results.
	await expect(page.getByRole('heading', { name: result.title })).toBeVisible();
	await expect(page.locator('.ErrorBox')).toHaveCount(0);
});
