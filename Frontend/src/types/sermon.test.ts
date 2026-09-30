import { describe, expect, it } from 'vitest';
import { PaginatedSermons } from './sermon';

describe('PaginatedSermons schema', () => {
	const validSermon = {
		id: 1,
		title: 'Faith Over Fear',
		videoLink: 'https://youtu.be/sample1',
		duration: 2500,
		date: '2026-02-23',
		description: 'A message on faith.',
		tags: [{ name: 'faith', source: 'ai' as const }],
		speaker: {
			id: 1,
			firstName: 'Dave',
			lastName: 'Patterson',
			role: 'Lead Speaker',
		},
		series: { id: 1, title: 'Live Your Best Life' },
		status: 'Published' as const,
	};

	it('parses valid paginated response', () => {
		const data = {
			items: [validSermon],
			total: 10,
			page: 1,
			pageSize: 9,
			totalPages: 2,
		};

		const parsed = PaginatedSermons.parse(data);
		expect(parsed.total).toBe(10);
		expect(parsed.page).toBe(1);
		expect(parsed.pageSize).toBe(9);
		expect(parsed.totalPages).toBe(2);
		expect(parsed.items).toHaveLength(1);
		expect(parsed.items[0].title).toBe('Faith Over Fear');
	});

	it('parses empty paginated response', () => {
		const data = {
			items: [],
			total: 0,
			page: 1,
			pageSize: 9,
			totalPages: 0,
		};

		const parsed = PaginatedSermons.parse(data);
		expect(parsed.items).toEqual([]);
		expect(parsed.total).toBe(0);
		expect(parsed.totalPages).toBe(0);
	});

	it('rejects invalid page or negative values', () => {
		expect(() =>
			PaginatedSermons.parse({
				items: [],
				total: -1,
				page: 1,
				pageSize: 9,
				totalPages: 0,
			}),
		).toThrow();

		expect(() =>
			PaginatedSermons.parse({
				items: [],
				total: 10,
				page: 0,
				pageSize: 9,
				totalPages: 1,
			}),
		).toThrow();

		expect(() =>
			PaginatedSermons.parse({
				items: [],
				total: 10,
				page: 1,
				pageSize: 0,
				totalPages: 1,
			}),
		).toThrow();
	});
});
