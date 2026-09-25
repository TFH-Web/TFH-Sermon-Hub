import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Pagination from './Pagination';

describe('Pagination Component', () => {
	it('renders first page correctly with disabled Previous button', () => {
		const onPageChange = vi.fn();
		const html = renderToString(
			React.createElement(Pagination, {
				pageInfo: {
					page: 1,
					totalPages: 3,
				},
				onPageChange,
			}),
		);

		expect(html).toContain('Page 1 of 3');
		expect(html).toContain('disabled=""');
		// Previous button has disabled attribute, Next button does not
		expect(html).toMatch(/<button[^>]*disabled[^>]*>Previous<\/button>/);
		expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Next<\/button>/);
	});

	it('renders middle page with both Previous and Next enabled', () => {
		const html = renderToString(
			React.createElement(Pagination, {
				pageInfo: {
					page: 2,
					totalPages: 3,
				},
				onPageChange: vi.fn(),
			}),
		);

		expect(html).toContain('Page 2 of 3');
		expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Previous<\/button>/);
		expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Next<\/button>/);
	});

	it('renders last page with Next disabled', () => {
		const html = renderToString(
			React.createElement(Pagination, {
				pageInfo: {
					page: 3,
					totalPages: 3,
				},
				onPageChange: vi.fn(),
			}),
		);

		expect(html).toContain('Page 3 of 3');
		expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Previous<\/button>/);
		expect(html).toMatch(/<button[^>]*disabled[^>]*>Next<\/button>/);
	});

	it('renders single page with both buttons disabled', () => {
		const html = renderToString(
			React.createElement(Pagination, {
				pageInfo: {
					page: 1,
					totalPages: 1,
				},
				onPageChange: vi.fn(),
			}),
		);

		expect(html).toContain('Page 1 of 1');
		expect(html).toMatch(/<button[^>]*disabled[^>]*>Previous<\/button>/);
		expect(html).toMatch(/<button[^>]*disabled[^>]*>Next<\/button>/);
	});

	it('renders empty state with Page 0 of 0 and both buttons disabled', () => {
		const html = renderToString(
			React.createElement(Pagination, {
				pageInfo: {
					page: 1,
					totalPages: 0,
				},
				onPageChange: vi.fn(),
			}),
		);

		expect(html).toContain('Page 0 of 0');
		expect(html).toMatch(/<button[^>]*disabled[^>]*>Previous<\/button>/);
		expect(html).toMatch(/<button[^>]*disabled[^>]*>Next<\/button>/);
	});

	it('disables buttons when loading', () => {
		const html = renderToString(
			React.createElement(Pagination, {
				pageInfo: {
					page: 2,
					totalPages: 5,
				},
				isLoading: true,
				onPageChange: vi.fn(),
			}),
		);

		expect(html).toMatch(/<button[^>]*disabled[^>]*>Previous<\/button>/);
		expect(html).toMatch(/<button[^>]*disabled[^>]*>Next<\/button>/);
	});

	it('accepts pageInfo object', () => {
		const html = renderToString(
			React.createElement(Pagination, {
				pageInfo: { page: 2, totalPages: 4, total: 36, pageSize: 9 },
				onPageChange: vi.fn(),
			}),
		);

		expect(html).toContain('Page 2 of 4');
		expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Previous<\/button>/);
		expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Next<\/button>/);
	});
});
