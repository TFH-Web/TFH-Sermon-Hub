import type z from 'zod';
import { Sermon } from '$/types/sermon';

/** A valid sermon for component tests. It goes through the real schema, so `date` is read the way the app reads it. */
export function makeSermon(
	overrides: Partial<z.input<typeof Sermon>> = {},
): Sermon {
	return Sermon.parse({
		id: 1,
		title: 'Faith Over Fear',
		videoLink: 'https://youtu.be/sample1',
		duration: 2500,
		date: '2026-04-19',
		description: 'A message on faith.',
		tags: [],
		speaker: {
			id: 1,
			firstName: 'Dave',
			lastName: 'Patterson',
			role: 'Lead Speaker',
		},
		series: { id: 1, title: 'Live Your Best Life' },
		status: 'Published',
		...overrides,
	});
}
