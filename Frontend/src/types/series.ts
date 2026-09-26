import z from 'zod'; // Tool that validates and checks data from the server so the app doesn't crash on unexpected shapes
import { Speaker } from './speaker'; // Imports speaker schema so we can validate speaker information attached to a series

export const Series = z.object({
	// Basic Series schema: used when only an id and title are needed (e.g. dropdowns or inside a sermon record)
	id: z.number(), // Unique database identifier for the series
	title: z.string(), // Title/name of the sermon series
});
export type Series = z.infer<typeof Series>;

// Card statistics schema: validates the pre-computed stats returned by the backend for each series card
export const SeriesCard = z.object({
	id: z.number(), // Series ID
	title: z.string(), // Series title
	sermonCount: z.number(), // Total number of sermons in this series (worked out on backend)
	firstDate: z.string().nullable(), // First sermon date (YYYY-MM-DD), or null if the series is empty
	lastDate: z.string().nullable(), // Most recent sermon date (YYYY-MM-DD), or null if the series is empty
	speakers: z.array(Speaker),
});
export type SeriesCard = z.infer<typeof SeriesCard>;

// Paginated envelope schema: validates the full response wrapper from GET /api/series
export const SeriesPage = z.object({
	items: z.array(SeriesCard), // The slice of series cards for the currently requested page
	total: z.number(), // Total number of series existing in the database (not just this page)
	page: z.number(), // The current page number being viewed
	perPage: z.number(), // How many series cards are shown per page (e.g. 12)
});
export type SeriesPage = z.infer<typeof SeriesPage>;
