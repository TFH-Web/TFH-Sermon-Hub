import { type FormEvent, useMemo, useState } from 'react';
import { aiSearchPreviewResults } from '$/data/aiSearch';

export type ContentType = 'all' | 'sermon' | 'transcript' | 'note';

export const contentOptions: { label: string; value: ContentType }[] = [
	{ label: 'All', value: 'all' },
	{ label: 'Sermons', value: 'sermon' },
	{ label: 'Transcripts', value: 'transcript' },
	{ label: 'Notes', value: 'note' },
];

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

	const visibleResults = useMemo(() => {
		if (!hasSearched) return [];

		const normalizedQuery = submittedQuery.toLowerCase();

		return aiSearchPreviewResults.filter(item => {
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
				normalizedQuery === '' || searchableText.includes(normalizedQuery);

			return matchesType && matchesSpeaker && matchesDate && matchesQuery;
		});
	}, [
		hasSearched,
		submittedQuery,
		submittedType,
		submittedSpeaker,
		submittedDate,
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
	};
}