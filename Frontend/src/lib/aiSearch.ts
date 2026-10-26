import type { SearchApiResult } from '$/hooks/useAISearchRequest';
import type { AISearchResultPreview } from '$/types/aiSearch';
import { resolveYouTubeVideoId } from './youtube';

// These extra values tell the card which snippet words to highlight.
export type AISearchVisibleResult = AISearchResultPreview & {
	sermonId: string;
	sourceStartSeconds: number | null;
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
	const sermonPath = `/sermons/${encodeURIComponent(String(sermonId))}`;
	const videoId = resolveYouTubeVideoId({
		videoLink: item.video_link ?? '',
		youtubeVideoId: item.youtube_video_id,
	});
	// Only an actual chunk with a validated video and valid range is timed evidence.
	const sourceStartSeconds =
		Number.isSafeInteger(item.chunk_id) &&
		(item.chunk_id ?? 0) > 0 &&
		videoId !== null &&
		typeof item.start_sec === 'number' &&
		Number.isFinite(item.start_sec) &&
		item.start_sec >= 0 &&
		item.start_sec <= Number.MAX_SAFE_INTEGER &&
		typeof item.end_sec === 'number' &&
		Number.isFinite(item.end_sec) &&
		item.end_sec >= item.start_sec
			? item.start_sec
			: null;
	const score = item.score ?? item.ai_score;

	// Turn the search query into individual words for highlighting.
	const matchTerms = [
		...new Set(query.toLowerCase().trim().split(/\s+/).filter(Boolean)),
	];

	return {
		// Convert the API fields to the names expected by the card.
		id: String(item.id),
		sermonId: String(sermonId),
		sourceStartSeconds,
		title: item.title,
		speaker: item.speaker,
		date: item.date,
		series: item.series ?? 'No series',
		contentType: item.type,
		snippet,
		thumbnailUrl: item.thumbnailUrl,

		// Ranking weight only: never a confidence percentage.
		match: Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0,

		// Open the matching sermon when the card is clicked.
		redirectTo:
			sourceStartSeconds === null
				? sermonPath
				: `${sermonPath}?${new URLSearchParams({ t: String(sourceStartSeconds) })}`,

		// Display the complete returned snippet and highlight matching words.
		previewSnippet: snippet,
		previewHasLeadingEllipsis: false,
		previewHasTrailingEllipsis: false,
		previewMatchTerms: matchTerms,
	};
}
