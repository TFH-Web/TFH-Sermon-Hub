import { type FormEvent, useMemo, useState } from 'react';
import { aiSearchPreviewResults } from '$/data/aiSearch';
import type { AISearchResultPreview } from '$/types/aiSearch';

export type ContentType = 'all' | 'sermon' | 'transcript' | 'note';

export const contentOptions: { label: string; value: ContentType }[] = [
	{ label: 'All', value: 'all' },
	{ label: 'Sermons', value: 'sermon' },
	{ label: 'Transcripts', value: 'transcript' },
	{ label: 'Notes', value: 'note' },
];

export type AISearchVisibleResult = AISearchResultPreview & {
	previewSnippet: string;
	previewHasLeadingEllipsis: boolean;
	previewHasTrailingEllipsis: boolean;
	previewMatchTerms: string[];
};

function normalizeQueryTerms(value: string) {
	return value.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function buildSnippetPreview(
	text: string,
	queryTerms: string[],
	maxLength = 72,
) {
	const source = text.trim();

	if (!source) {
		return {
			previewSnippet: '',
			previewHasLeadingEllipsis: false,
			previewHasTrailingEllipsis: false,
			previewMatchTerms: queryTerms,
		};
	}

	if (queryTerms.length === 0) {
		const previewSnippet = source.slice(0, maxLength).trimEnd();

		return {
			previewSnippet,
			previewHasLeadingEllipsis: false,
			previewHasTrailingEllipsis: source.length > previewSnippet.length,
			previewMatchTerms: [],
		};
	}

	const lowerSource = source.toLowerCase();

	let matchIndex = -1;

	for (const term of queryTerms) {
		const foundIndex = lowerSource.indexOf(term);

		if (foundIndex !== -1 && (matchIndex === -1 || foundIndex < matchIndex)) {
			matchIndex = foundIndex;
		}
	}

	if (matchIndex === -1) {
		const previewSnippet = source.slice(0, maxLength).trimEnd();

		return {
			previewSnippet,
			previewHasLeadingEllipsis: false,
			previewHasTrailingEllipsis: source.length > previewSnippet.length,
			previewMatchTerms: queryTerms,
		};
	}

	let start = Math.max(0, matchIndex - Math.floor(maxLength * 0.35));
	let end = Math.min(source.length, start + maxLength);

	if (end - start < maxLength) {
		start = Math.max(0, end - maxLength);
	}

	if (start > 0) {
		const nextSpace = source.indexOf(' ', start);
		if (nextSpace !== -1 && nextSpace - start <= 12) {
			start = nextSpace + 1;
		}
	}

	if (end < source.length) {
		const previousSpace = source.lastIndexOf(' ', end);
		if (previousSpace !== -1 && end - previousSpace <= 12) {
			end = previousSpace;
		}
	}

	const previewSnippet = source.slice(start, end).trim();

	return {
		previewSnippet,
		previewHasLeadingEllipsis: start > 0,
		previewHasTrailingEllipsis: end < source.length,
		previewMatchTerms: queryTerms,
	};
}

function matchesDateFilter(itemDateText: string, filterValue: string) {
	if (filterValue === 'any') return true;

	const itemDate = new Date(itemDateText);

	if (Number.isNaN(itemDate.getTime())) {
		return true;
	}

	const now = new Date();
	const oneDay = 24 * 60 * 60 * 1000;

	if (filterValue === '24h') {
		return itemDate.getTime() >= now.getTime() - oneDay;
	}

	if (filterValue === '7d') {
		return itemDate.getTime() >= now.getTime() - 7 * oneDay;
	}

	if (filterValue === '14d') {
		return itemDate.getTime() >= now.getTime() - 14 * oneDay;
	}

	if (filterValue === '28d') {
		return itemDate.getTime() >= now.getTime() - 28 * oneDay;
	}

	if (filterValue === '1y') {
		return itemDate.getTime() >= now.getTime() - 365 * oneDay;
	}

	if (filterValue.startsWith('custom|')) {
		const [, from, to] = filterValue.split('|');

		if (from) {
			const fromDate = new Date(`${from}T00:00:00`);
			if (itemDate.getTime() < fromDate.getTime()) {
				return false;
			}
		}

		if (to) {
			const toDate = new Date(`${to}T23:59:59.999`);
			if (itemDate.getTime() > toDate.getTime()) {
				return false;
			}
		}

		return true;
	}

	return true;
}

export default function useAISearch() {
	const [query, setQuery] = useState('');
	const [type, setType] = useState<ContentType>('all');
	const [speaker, setSpeaker] = useState('any');
	const [date, setDate] = useState('any');

	const [submittedQuery, setSubmittedQuery] = useState('');
	const [submittedType, setSubmittedType] = useState<ContentType>('all');
	const [submittedSpeaker, setSubmittedSpeaker] = useState('any');
	const [submittedDate, setSubmittedDate] = useState('any');
	const [hasSearched, setHasSearched] = useState(false);

	const showResults = hasSearched;

	function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();

		setSubmittedQuery(query.trim());
		setSubmittedType(type);
		setSubmittedSpeaker(speaker);
		setSubmittedDate(date);
		setHasSearched(true);
	}

	const visibleResults = useMemo<AISearchVisibleResult[]>(() => {
		if (!hasSearched) return [];

		const queryTerms = normalizeQueryTerms(submittedQuery);

		return aiSearchPreviewResults
			.filter(item => {
				const matchesType =
					submittedType === 'all' || item.contentType === submittedType;
				const matchesSpeaker =
					submittedSpeaker === 'any' || item.speaker === submittedSpeaker;
				const matchesDate = matchesDateFilter(item.date, submittedDate);

				const searchableText = [
					item.title,
					item.speaker,
					item.series,
					item.snippet,
					item.contentType,
					item.date,
				]
					.join(' ')
					.toLowerCase();

				const matchesQuery =
					queryTerms.length === 0 ||
					queryTerms.some(term => searchableText.includes(term));

				return matchesType && matchesSpeaker && matchesDate && matchesQuery;
			})
			.map(item => ({
				...item,
				...buildSnippetPreview(item.snippet, queryTerms),
			}));
	}, [
		hasSearched,
		submittedDate,
		submittedQuery,
		submittedSpeaker,
		submittedType,
	]);

	return {
		query,
		setQuery,
		type,
		setType,
		speaker,
		setSpeaker,
		date,
		setDate,
		showResults,
		visibleResults,
		handleSubmit,
		contentOptions,
		submittedQuery,
	};
}
