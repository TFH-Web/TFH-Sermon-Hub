import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

// These are the content filters supported by the search page.
export type ContentType = 'all' | 'sermon' | 'transcript' | 'note';

// These values are sent to the search API.
export interface SearchParameters {
	q: string;
	type: ContentType;
	speaker: string;
	date: string;
	page: number;
	pageSize: number;
}

// This describes one result returned by the current backend.
export interface SearchApiResult {
	id: number | string;
	title: string;
	type: Exclude<ContentType, 'all'>;
	speaker: string;
	date: string;
	summary: string;
	ai_score: number;
	snippet?: string;
	series?: string;
	sermonId?: number | string;
	thumbnailUrl?: string;
}

// This describes a page of search results.
export interface SearchPage {
	items: SearchApiResult[];
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
}

// The current backend returns an array.
// This also accepts a paginated response when the backend supports it.
type SearchResponse = SearchApiResult[] | SearchPage;

export default function useAISearchRequest(
	parameters: SearchParameters,
	enabled: boolean,
) {
	return useQuery({
		// Each query, filter selection, and page gets its own cached results.
		queryKey: ['ai-search', parameters],

		// Wait until the user submits their first search.
		enabled,

		// Show failed requests immediately so the user can choose Retry.
		retry: false,

		queryFn: async ({ signal }): Promise<SearchPage> => {
			// Send the query, filters, and requested page to Flask.
			const response = await axios.get<SearchResponse>('/api/search', {
				params: parameters,
				signal,
			});

			// Use server pagination when the API returns it.
			if (!Array.isArray(response.data)) {
				return response.data;
			}

			// Temporarily paginate the array returned by the current backend.
			const start = (parameters.page - 1) * parameters.pageSize;

			return {
				items: response.data.slice(start, start + parameters.pageSize),
				page: parameters.page,
				pageSize: parameters.pageSize,
				total: response.data.length,
				totalPages: Math.ceil(response.data.length / parameters.pageSize),
			};
		},
	});
}
