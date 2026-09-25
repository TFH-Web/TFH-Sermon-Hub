import z from 'zod';
import { Speaker } from './speaker';

export const Series = z.object({
	id: z.number(),
	title: z.string(),
});
export type Series = z.infer<typeof Series>;

// Card statistics returned per series in the paginated response
export const SeriesCard = z.object({
	id: z.number(),
	title: z.string(),
	sermonCount: z.number(),
	firstDate: z.string().nullable(),
	lastDate: z.string().nullable(),
	speakers: z.array(Speaker),
});
export type SeriesCard = z.infer<typeof SeriesCard>;

// Paginated envelope returned by GET /api/series
export const SeriesPage = z.object({
	items: z.array(SeriesCard),
	total: z.number(),
	page: z.number(),
	perPage: z.number(),
});
export type SeriesPage = z.infer<typeof SeriesPage>;
