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

// Shared TFH-462 result. Null source fields mean a metadata-only match.
export interface SearchApiResult {
	id: number | string;
	title: string;
	type: Exclude<ContentType, 'all'>;
	speaker: string;
	date: string;
	summary: string;
	ai_score: number;
	score?: number;
	chunk_id?: number | null;
	start_sec?: number | null;
	end_sec?: number | null;
	youtube_video_id?: string | null;
	video_link?: string | null;
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

// Requests with a page return an envelope; retain the legacy array contract.
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

			// Compatibility for an unpaginated legacy response only.
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
