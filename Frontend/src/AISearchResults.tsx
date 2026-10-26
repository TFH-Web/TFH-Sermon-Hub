import { Navigate, useLocation } from 'react-router-dom';

// Retain this type while the unused legacy card still imports it.
export type SearchResult = {
	id: number;
	title: string;
	type: string;
	speaker: string;
	date: string;
	summary: string;
	ai_score: number;
};

export default function AISearchResults() {
	const { search, hash } = useLocation();
	const parameters = new URLSearchParams(search);

	// Opening the results route means a search has been requested.
	if (!parameters.has('q')) {
		parameters.set('q', '');
	}

	// Both search URLs now use the same page and request hook.
	return (
		<Navigate
			to={{
				pathname: '/ai-search',
				search: `?${parameters.toString()}`,
				hash,
			}}
			replace
		/>
	);
}
