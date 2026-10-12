import { type FormEvent, useState } from 'react';
import useAISearchRequest, {
	type ContentType,
	type SearchParameters,
} from '$/hooks/useAISearchRequest';
import { mapSearchResult } from '$/lib/aiSearch';

// These labels appear above the search results.
const contentOptions: { label: string; value: ContentType }[] = [
	{ label: 'All', value: 'all' },
	{ label: 'Sermons', value: 'sermon' },
	{ label: 'Transcripts', value: 'transcript' },
	{ label: 'Notes', value: 'note' },
];

export default function useAISearch() {
	// Keep the text being typed separate from the submitted query.
	const [query, setQuery] = useState('');
	const [hasSearched, setHasSearched] = useState(false);

	// Keep the submitted query, filters, and page together.
	const [parameters, setParameters] = useState<SearchParameters>({
		q: '',
		type: 'all',
		speaker: 'any',
		date: 'any',
		page: 1,
		pageSize: 6,
	});

	// Load results for the current submitted search.
	const searchRequest = useAISearchRequest(parameters, hasSearched);

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const submittedQuery = query.trim();

		// Searching again with the same values refreshes the results.
		if (
			hasSearched &&
			submittedQuery === parameters.q &&
			parameters.page === 1
		) {
			void searchRequest.refetch();
			return;
		}

		// Start a submitted query on the first page.
		setParameters(previous => ({
			...previous,
			q: submittedQuery,
			page: 1,
		}));
		setHasSearched(true);
	}

	// Changing a filter starts its results on the first page.
	function setType(type: ContentType) {
		setParameters(previous => ({ ...previous, type, page: 1 }));
	}

	function setSpeaker(speaker: string) {
		setParameters(previous => ({ ...previous, speaker, page: 1 }));
	}

	function setDate(date: string) {
		setParameters(previous => ({ ...previous, date, page: 1 }));
	}

	// Changing pages keeps the submitted query and filters.
	function setPage(page: number) {
		setParameters(previous => ({ ...previous, page }));
	}

	// Convert each returned result into the values expected by the card.
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

		// Run the current request again when the user clicks Retry.
		retry: () => {
			void searchRequest.refetch();
		},
		handleSubmit,
	};
}
