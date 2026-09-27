import type { Page } from '@playwright/test';
import { seriess, sermons, speakers, tags } from './data';
import { paginated } from './pagination';

export async function setupRoutes(page: Page) {
	await page.route('**/api/*', async route => {
		const url = new URL(route.request().url());

		switch (url.pathname) {
			case '/api/speakers':
				return paginated(speakers, route, url.searchParams);
			case '/api/series':
				return paginated(seriess, route, url.searchParams);
			case '/api/tags':
				return paginated(tags, route, url.searchParams);
			case '/api/sermons':
				return paginated(sermons, route, url.searchParams);
			default:
				return route.abort();
		}
	});
}
