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

/**
 * Like setupRoutes, but /api/tags keeps its own per-call mutable copy of the tag list instead of
 * the shared one in data.ts, and POST/PATCH/DELETE actually create, rename and remove tags in it.
 * Lets a test reload the page, or navigate elsewhere, and see its own mutations persist —
 * without leaking state into other tests that import the same data.ts array.
 */
export async function setupTagMutationRoutes(page: Page) {
	let mutableTags = tags.map(tag => ({ ...tag }));

	// A separate route for /api/tags/<name>: the single "*" in "**/api/*" below cannot match
	// the extra path segment, so renames and deletes need their own registration.
	await page.route('**/api/tags/*', async route => {
		const request = route.request();
		const name = decodeURIComponent(new URL(request.url()).pathname.split('/').pop() ?? '');
		const tag = mutableTags.find(t => t.name === name);

		if (request.method() === 'PATCH') {
			if (!tag) return route.fulfill({ status: 404, json: { message: 'Tag not found' } });
			const { newName } = request.postDataJSON();
			tag.name = newName;
			return route.fulfill({ status: 200, json: tag });
		}

		if (request.method() === 'DELETE') {
			mutableTags = mutableTags.filter(t => t.name !== name);
			return route.fulfill({ status: 204, body: '' });
		}

		return route.fallback();
	});

	await page.route('**/api/*', async route => {
		const request = route.request();
		const url = new URL(request.url());

		if (url.pathname === '/api/tags' && request.method() === 'POST') {
			const { name } = request.postDataJSON();
			const newTag = { name, source: 'manual', count: 0 };
			mutableTags = [...mutableTags, newTag];
			return route.fulfill({ status: 201, json: newTag });
		}

		switch (url.pathname) {
			case '/api/speakers':
				return paginated(speakers, route, url.searchParams);
			case '/api/series':
				return paginated(seriess, route, url.searchParams);
			case '/api/tags': {
				// Mirrors the real backend: ?used=true (the sermon filter's query) only returns
				// tags attached to at least one sermon, same as views.py's get_tags.
				const used = ['true', '1'].includes(url.searchParams.get('used') ?? '');
				const visible = used ? mutableTags.filter(t => t.count > 0) : mutableTags;
				return paginated(visible, route, url.searchParams);
			}
			case '/api/sermons':
				return paginated(sermons, route, url.searchParams);
			default:
				return route.abort();
		}
	});
}
