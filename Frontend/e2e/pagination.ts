import type { Route } from '@playwright/test';

export function paginated(
	items: unknown[],
	route: Route,
	params: URLSearchParams,
): ReturnType<Route['fulfill']> {
	if (!params.has('page')) return route.fulfill({ json: items });

	const currentPage = parseInt(params.get('page') ?? '1', 10);
	const pageSize = parseInt(params.get('pageSize') ?? '10', 10);

	if (Number.isNaN(currentPage)) {
		return errorResponse(route, 'Invalid page parameter');
	}

	if (Number.isNaN(pageSize)) {
		return errorResponse(route, 'Invalid page size parameter');
	}

	if (currentPage < 1) {
		return errorResponse(route, 'Page must be a positive integer');
	}

	if (pageSize < 1) {
		return errorResponse(
			route,
			'Page size must be an integer greater than or equal to 1',
		);
	}

	return route.fulfill({
		json: {
			items: items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
			total: items.length,
			page: currentPage,
			pageSize,
			perPage: pageSize,
			totalPages: Math.ceil(items.length / pageSize),
		},
	});
}

function errorResponse(
	route: Route,
	message: string,
): ReturnType<Route['fulfill']> {
	return route.fulfill({
		status: 404,
		json: {
			error: message,
			message,
		},
	});
}
