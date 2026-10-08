import type { SearchApiResult } from '$/hooks/useAISearchRequest';
import type { AISearchResultPreview } from '$/types/aiSearch';

// These extra values tell the card which snippet words to highlight.
export type AISearchVisibleResult = AISearchResultPreview & {
	previewSnippet: string;
	previewHasLeadingEllipsis: boolean;
	previewHasTrailingEllipsis: boolean;
	previewMatchTerms: string[];
};

export function mapSearchResult(
	item: SearchApiResult,
	query: string,
): AISearchVisibleResult {
	// Prefer the returned snippet, or use the current API's summary.
	const snippet = item.snippet ?? item.summary;

	// Use the sermon ID when the API supplies a separate result ID.
	const sermonId = item.sermonId ?? item.id;

	// Turn the search query into individual words for highlighting.
	const matchTerms = [
		...new Set(query.toLowerCase().trim().split(/\s+/).filter(Boolean)),
	];

	return {
		// Convert the API fields to the names expected by the card.
		id: String(item.id),
		title: item.title,
		speaker: item.speaker,
		date: item.date,
		series: item.series ?? 'No series',
		contentType: item.type,
		snippet,
		thumbnailUrl: item.thumbnailUrl,

		// Convert a score such as 0.97 into 97%.
		match: Math.round(Math.min(1, Math.max(0, item.ai_score)) * 100),

		// Open the matching sermon when the card is clicked.
		redirectTo: `/sermons/${encodeURIComponent(String(sermonId))}`,

		// Display the complete returned snippet and highlight matching words.
		previewSnippet: snippet,
		previewHasLeadingEllipsis: false,
		previewHasTrailingEllipsis: false,
		previewMatchTerms: matchTerms,
	};
}
