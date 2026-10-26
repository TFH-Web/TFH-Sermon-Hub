// What a person sees on the dashboard after changing the library. These follow the real clicks: a sermon link on the
// dashboard is a plain <a href>, which loads the page afresh, so the dashboard's cached data starts out empty here.
// That the cached data of a dashboard that is already open is refreshed too is covered by SermonMutations.test.tsx
// and useImportSermons.test.ts.
import { expect, type Page, test } from '@playwright/test';
import { sermons } from './data';
import { paginated } from './pagination';
import { setupRoutes } from './setup';

// Twelve sermons, so the dashboard's five rows leave some behind to move up when one is deleted.
// Their dates rise with their ids, so the newest sermon is the one with the highest id.
const library = [
	...sermons,
	...[11, 12].map(id => ({
		...sermons[0],
		id,
		title: `Sermon ${id}`,
		date: `2026-02-${id + 9}`,
	})),
];

/** Serve the sermons from a list that deleting and editing change, on top of the default speakers, series and tags. */
async function libraryRoutes(page: Page) {
	await setupRoutes(page);
	const state = { sermons: library.map(sermon => ({ ...sermon })) };
	const newestFirst = () =>
		[...state.sermons].sort(
			(a, b) => b.date.localeCompare(a.date) || b.id - a.id,
		);

	// Paths are /api/sermons, /api/sermons/<id> and /api/sermons/<id>/transcript. setupRoutes only sees the first.
	await page.route(
		url => /^\/api\/sermons(\/\d+(\/transcript)?)?$/.test(url.pathname),
		async route => {
			const request = route.request();
			const url = new URL(request.url());
			const [, , , id, extra] = url.pathname.split('/');

			if (id === undefined) {
				// The whole list when no page is asked for, as the sermon page does, or one page, as the dashboard does.
				return paginated(newestFirst(), route, url.searchParams);
			}
			const sermon = state.sermons.find(s => s.id === Number(id));
			if (!sermon) {
				return route.fulfill({
					status: 404,
					json: { error: 'Sermon not found', message: 'Sermon not found' },
				});
			}
			if (extra === 'transcript') {
				return route.fulfill({ json: { transcript: null, segments: [] } });
			}
			switch (request.method()) {
				case 'DELETE':
					state.sermons = state.sermons.filter(s => s.id !== sermon.id);
					return route.fulfill({ status: 204 });
				case 'PATCH':
					sermon.title = request.postDataJSON().title;
					return route.fulfill({ json: sermon });
				default:
					return route.fulfill({ json: sermon });
			}
		},
	);
}

function statCard(page: Page, name: string) {
	return page.locator('.StatCard').filter({
		has: page.getByRole('heading', { name, exact: true }),
	});
}

function recentRows(page: Page) {
	return page.getByRole('rowheader');
}

test('dashboard drops a deleted sermon from the total and recent list', async ({
	page,
}) => {
	await libraryRoutes(page);
	await page.goto('/');
	await expect(statCard(page, 'Total Sermons')).toContainText('12');
	await expect(recentRows(page)).toHaveText([
		'Sermon 12',
		'Sermon 11',
		'Sermon 10',
		'Sermon 9',
		'Sermon 8',
	]);

	await page.getByRole('link', { name: 'Sermon 12', exact: true }).click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await page.getByRole('button', { name: 'Delete Sermon' }).click();
	await expect(page).toHaveURL(/\/sermons$/);

	await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
	await expect(statCard(page, 'Total Sermons')).toContainText('11');
	// The next-newest sermon moves up from outside the first page, so the list was asked for again, not just filtered.
	await expect(recentRows(page)).toHaveText([
		'Sermon 11',
		'Sermon 10',
		'Sermon 9',
		'Sermon 8',
		'Sermon 7',
	]);
	// Deleting a sermon leaves its series and speaker in place, and they are counted even with no sermons.
	await expect(statCard(page, 'Series')).toContainText('15');
	await expect(statCard(page, 'Speakers')).toContainText('15');
});

test('dashboard shows an edited sermon title', async ({ page }) => {
	await libraryRoutes(page);
	await page.goto('/');
	await page.getByRole('link', { name: 'Sermon 12', exact: true }).click();
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await page.getByPlaceholder('Enter sermon title').fill('Sermon 12 renamed');
	await page.getByRole('button', { name: 'Save Changes' }).click();
	// This toast appears once the change is saved and the lists have been asked for again.
	await expect(page.getByText('Sermon updated successfully')).toBeVisible();

	await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
	await expect(recentRows(page).first()).toHaveText('Sermon 12 renamed');
	await expect(statCard(page, 'Total Sermons')).toContainText('12');
});
