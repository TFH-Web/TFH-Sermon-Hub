import { describe, expect, test } from 'vitest';
import type { SearchApiResult } from '$/hooks/useAISearchRequest';
import { mapSearchResult } from './aiSearch';

// A sample API result shared by the tests.
const sampleResult: SearchApiResult = {
	id: 7,
	title: 'Faith Over Fear',
	type: 'sermon',
	speaker: 'Dave Patterson',
	date: '2026-09-27',
	summary: 'Trusting God when anxiety feels overwhelming.',
	ai_score: 0.97,
	series: 'Faith Series',
	thumbnailUrl: '/images/faith.jpg',
};

const timedResult: SearchApiResult = {
	...sampleResult,
	sermonId: 42,
	chunk_id: 481,
	start_sec: 75.5,
	end_sec: 91.25,
	youtube_video_id: 'F_OiCiZ3Y3Y',
	video_link: 'https://www.youtube.com/watch?v=F_OiCiZ3Y3Y',
};

describe('search source navigation', () => {
	test.each([0, 1.25, 75.5])('preserves the exact source start %s', seconds => {
		const mapped = mapSearchResult(
			{ ...timedResult, start_sec: seconds },
			'grace',
		);
		expect(mapped.redirectTo).toBe(`/sermons/42?t=${seconds}`);
		expect(mapped.sourceStartSeconds).toBe(seconds);
		expect(mapped.sermonId).toBe('42');
	});

	test.each([
		{ chunk_id: null, start_sec: null, end_sec: null },
		{ chunk_id: null, start_sec: 0 },
		{ chunk_id: -1 },
		{ start_sec: null },
		{ start_sec: -1 },
		{ start_sec: Number.NaN },
		{ start_sec: Number.POSITIVE_INFINITY },
		{ start_sec: Number.MAX_SAFE_INTEGER + 1 },
		{ end_sec: null },
		{ end_sec: 1 },
		{ end_sec: Number.POSITIVE_INFINITY },
		{ youtube_video_id: null, video_link: null },
		{ youtube_video_id: 'invalid' },
		{ video_link: 'https://evil.example/watch?v=F_OiCiZ3Y3Y' },
		{ youtube_video_id: 'abcdefghijk' },
	])('does not invent a seek for invalid or absent source %j', source => {
		const mapped = mapSearchResult({ ...timedResult, ...source }, 'grace');
		expect(mapped.redirectTo).toBe('/sermons/42');
		expect(mapped.sourceStartSeconds).toBeNull();
	});

	test('uses the documented score field without presenting a percentage', () => {
		expect(mapSearchResult({ ...sampleResult, score: 0.685 }, '').match).toBe(
			0.685,
		);
	});
});

describe('mapSearchResult', () => {
	// Check that returned sermon information reaches the card.
	test('maps sermon metadata to the card', () => {
		const result = mapSearchResult(sampleResult, 'anxiety');

		expect(result).toMatchObject({
			id: '7',
			title: 'Faith Over Fear',
			contentType: 'sermon',
			speaker: 'Dave Patterson',
			date: '2026-09-27',
			series: 'Faith Series',
			thumbnailUrl: '/images/faith.jpg',
			match: 0.97,
		});
	});

	// The current backend returns summary instead of snippet.
	test('uses the summary when no snippet is returned', () => {
		const result = mapSearchResult(sampleResult, 'anxiety');

		expect(result.snippet).toBe(sampleResult.summary);
		expect(result.previewSnippet).toBe(sampleResult.summary);
	});

	// A returned snippet should take priority over the summary.
	test('uses the returned snippet when available', () => {
		const result = mapSearchResult(
			{
				...sampleResult,
				snippet: 'Prayer brings peace during anxiety.',
			},
			'anxiety',
		);

		expect(result.snippet).toBe('Prayer brings peace during anxiety.');
		expect(result.previewSnippet).toBe(result.snippet);
		expect(result.previewHasLeadingEllipsis).toBe(false);
		expect(result.previewHasTrailingEllipsis).toBe(false);
	});

	// An empty snippet is still a supplied snippet.
	test('preserves an empty returned snippet', () => {
		const result = mapSearchResult({ ...sampleResult, snippet: '' }, 'anxiety');

		expect(result.snippet).toBe('');
		expect(result.previewSnippet).toBe('');
	});

	// Missing optional metadata should not break the card.
	test('handles missing series and thumbnail', () => {
		const result = mapSearchResult(
			{
				...sampleResult,
				series: undefined,
				thumbnailUrl: undefined,
			},
			'anxiety',
		);

		expect(result.series).toBe('No series');
		expect(result.thumbnailUrl).toBeUndefined();
	});

	// Keep ranking weights as weights, without converting them into confidence percentages.
	test.each([
		{ score: -0.2, expected: 0 },
		{ score: 0, expected: 0 },
		{ score: 0.975, expected: 0.975 },
		{ score: 1, expected: 1 },
		{ score: 1.4, expected: 1 },
	])('keeps score $score as ranking weight $expected', ({
		score,
		expected,
	}) => {
		const result = mapSearchResult(
			{ ...sampleResult, ai_score: score },
			'anxiety',
		);
		expect(result.match).toBe(expected);
	});

	// Highlight words should ignore capitalization, extra spaces, and repeats.
	test('creates unique lowercase highlight terms', () => {
		const result = mapSearchResult(
			sampleResult,
			'  Anxiety   PEACE anxiety\tpeace  ',
		);

		expect(result.previewMatchTerms).toEqual(['anxiety', 'peace']);
	});

	// An empty query should not create empty highlight words.
	test.each([
		'',
		'   \t\n',
	])('handles an empty or whitespace-only query: %j', query => {
		const result = mapSearchResult(sampleResult, query);

		expect(result.previewMatchTerms).toEqual([]);
	});

	// Search result IDs and sermon IDs can be different.
	test('links to the supplied sermon ID', () => {
		const result = mapSearchResult(
			{ ...sampleResult, sermonId: 42 },
			'anxiety',
		);

		expect(result.redirectTo).toBe('/sermons/42');
	});

	// The current backend only supplies a result ID.
	test('uses the result ID when no sermon ID is supplied', () => {
		const result = mapSearchResult(sampleResult, 'anxiety');

		expect(result.redirectTo).toBe('/sermons/7');
	});

	// Special characters in an ID should remain inside one URL segment.
	test('encodes special characters in the sermon link', () => {
		const result = mapSearchResult(
			{ ...sampleResult, sermonId: 'sermon/42' },
			'anxiety',
		);

		expect(result.redirectTo).toBe('/sermons/sermon%2F42');
	});
});
