import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { toCalendarDateString } from '$/lib/date';
import { PaginatedSermons, Sermon } from './sermon';

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

describe('Sermon schema', () => {
	// One zone behind UTC and the furthest zone ahead of it (UTC+14).
	const ZONES = ['America/Los_Angeles', 'Pacific/Kiritimati'];

	const originalTZ = process.env.TZ;
	afterEach(() => {
		if (originalTZ === undefined) delete process.env.TZ;
		else process.env.TZ = originalTZ;
	});

	// Missing or null means the summary's origin is unknown, so neither is turned into 'ai' or 'manual'.
	it.each([
		'ai',
		'manual',
		null,
		undefined,
	] as const)('keeps summarySource %j as it came', summarySource => {
		const parsed = Sermon.parse({ ...validSermon, summarySource });
		expect(parsed.summarySource).toBe(summarySource);
	});

	it.each(['human', 'AI', ''])('rejects the summarySource %j', summarySource => {
		expect(
			Sermon.safeParse({ ...validSermon, summarySource }).success,
		).toBe(false);
	});

	it.each(ZONES)('reads a date-only string as the same day in %s', zone => {
		process.env.TZ = zone;
		const parsed = Sermon.parse({ ...validSermon, date: '2026-03-01' });
		expect(toCalendarDateString(parsed.date)).toBe('2026-03-01');
	});

	it.each([
		'2026-02-30',
		'04/19/2026',
		'2026-04-19T00:00:00Z',
	])('rejects the sermon date %j', date => {
		expect(Sermon.safeParse({ ...validSermon, date }).success).toBe(false);
	});
});

describe('PaginatedSermons schema', () => {
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
