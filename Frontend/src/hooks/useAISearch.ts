import { type FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useAISearchRequest, {
	type ContentType,
	type SearchParameters,
} from '$/hooks/useAISearchRequest';
import { mapSearchResult } from '$/lib/aiSearch';

// These are the content choices currently supported by the frontend.
const contentOptions: { label: string; value: ContentType }[] = [
	{ label: 'All', value: 'all' },
	{ label: 'Sermons', value: 'sermon' },
	{ label: 'Transcripts', value: 'transcript' },
	{ label: 'Notes', value: 'note' },
];

// Restore the submitted search from the address bar.
function readParameters(search: URLSearchParams): SearchParameters {
	const requestedType = search.get('type') ?? 'all';
	const type = contentOptions.some(option => option.value === requestedType)
		? (requestedType as ContentType)
		: 'all';

	const rawPage = search.get('page') ?? '1';
	const requestedPage = /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;

	return {
		q: (search.get('q') ?? '').trim(),
		type,
		speaker: search.get('speaker') || 'any',
		date: search.get('date') || 'any',
		page: Number.isSafeInteger(requestedPage) ? requestedPage : 1,
		pageSize: 6,
	};
}

export default function useAISearch() {
	const [searchParams, setSearchParams] = useSearchParams();
	const parameters = readParameters(searchParams);
	const hasSearched = searchParams.has('q');

	// Typing stays separate from the submitted query in the URL.
	const [query, setQuery] = useState(parameters.q);

	// Restore the input after reload or Back/Forward navigation.
	useEffect(() => {
		setQuery(parameters.q);
	}, [parameters.q]);

	const searchRequest = useAISearchRequest(parameters, hasSearched);

	function updateParameters(
		changes: Partial<SearchParameters>,
		submit = false,
	) {
		// Read the latest address bar so quick changes keep earlier filters.
		const previous = new URLSearchParams(window.location.search);
		const next = {
			...readParameters(previous),
			...changes,
		};

		// Preserve unrelated URL parameters.
		const url = new URLSearchParams(previous);
		url.set('q', next.q);
		url.set('type', next.type);
		url.set('speaker', next.speaker);
		url.set('date', next.date);
		url.set('page', String(next.page));

		// Choosing filters before submission must not start a search.
		if (!submit && !previous.has('q')) {
			url.delete('q');
		}

		setSearchParams(url);
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const submittedQuery = query.trim();

		// Submitting the same first page refreshes its current results.
		if (
			hasSearched &&
			submittedQuery === parameters.q &&
			parameters.page === 1
		) {
			void searchRequest.refetch();
			return;
		}

		updateParameters({ q: submittedQuery, page: 1 }, true);
	}

	// A changed filter starts at the first page.
	function setType(type: ContentType) {
		updateParameters({ type, page: 1 });
	}

	function setSpeaker(speaker: string) {
		updateParameters({ speaker, page: 1 });
	}

	function setDate(date: string) {
		updateParameters({ date, page: 1 });
	}

	function setPage(page: number) {
		if (!Number.isSafeInteger(page) || page < 1) {
			return;
		}

		updateParameters({ page });
	}

	const visibleResults = (searchRequest.data?.items ?? []).map(item =>
		mapSearchResult(item, parameters.q),
	);

	return {
		query,
		setQuery,
		type: parameters.type,
		setType,
		speaker: parameters.speaker,
		setSpeaker,
		date: parameters.date,
		setDate,
		page: parameters.page,
		setPage,
		showResults: hasSearched,
		submittedQuery: parameters.q,
		contentOptions,
		visibleResults,
		total: searchRequest.data?.total ?? 0,
		totalPages: searchRequest.data?.totalPages ?? 0,
		isLoading: searchRequest.isFetching,
		isError: searchRequest.isError,
		retry: () => {
			void searchRequest.refetch();
		},
		handleSubmit,
	};
}
