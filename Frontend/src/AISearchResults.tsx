import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '$/components/MainLayout';
import SearchResultCard from '$/components/SearchResultCard';
import './AISearchResults.css';

export type SearchResult = {
	id: number;
	title: string;
	type: string;
	speaker: string;
	date: string;
	summary: string;
	ai_score: number;
};

const MOCK_RESULTS: SearchResult[] = [
	{
		id: 1,
		title: 'Under Grace',
		type: 'sermon',
		speaker: 'Dave Patterson',
		date: 'Feb 23, 2026',
		summary:
			'Exploring what it means to live under grace rather than law — Dave unpacks how grace reshapes identity, forgiveness, and everyday freedom.',
		ai_score: 0.98,
	},
	{
		id: 2,
		title: 'Anchored in Hope',
		type: 'sermon',
		speaker: 'Guest Speaker',
		date: 'Feb 9, 2026',
		summary:
			'Hope as an anchor for the soul — how to hold steady in uncertain seasons by grounding yourself in what does not move.',
		ai_score: 0.87,
	},
	{
		id: 3,
		title: 'Walking in Freedom',
		type: 'sermon',
		speaker: 'Dave Patterson',
		date: 'Feb 16, 2026',
		summary:
			'Freedom is not the absence of boundaries but living inside the right ones. A practical look at what walking free looks like day to day.',
		ai_score: 0.81,
	},
	{
		id: 4,
		title: 'Power of Community',
		type: 'sermon',
		speaker: 'Dave Patterson',
		date: 'Feb 2, 2026',
		summary:
			'Why we cannot grow alone — the shape and rhythm of biblical community, and how shared life carries us further than solo faith.',
		ai_score: 0.74,
	},
	{
		id: 5,
		title: 'Bold Faith',
		type: 'sermon',
		speaker: 'Dave Patterson',
		date: 'Jan 26, 2026',
		summary:
			'Faith that speaks up. Dave walks through what it looks like to take small, brave steps of trust when the outcome is unclear.',
		ai_score: 0.69,
	},
];

function matchesFilters(
	result: SearchResult,
	q: string,
	type: string,
	speaker: string,
): boolean {
	if (type !== 'all' && result.type !== type) return false;
	if (speaker !== 'any' && result.speaker !== speaker) return false;

	if (!q) return true;
	const needle = q.toLowerCase();
	return (
		result.title.toLowerCase().includes(needle) ||
		result.summary.toLowerCase().includes(needle) ||
		result.speaker.toLowerCase().includes(needle)
	);
}

export default function AISearchResults() {
	const [searchParams] = useSearchParams();

	const q = searchParams.get('q') ?? '';
	const type = searchParams.get('type') ?? 'all';
	const speaker = searchParams.get('speaker') ?? 'any';
	const date = searchParams.get('date') ?? 'any';

	const data = useMemo(
		() => MOCK_RESULTS.filter(r => matchesFilters(r, q, type, speaker)),
		[q, type, speaker],
	);

	return (
		<MainLayout title="AI Search Results">
			<main className="AISearchResults">
				<div className="AISearchResults-container">
					<h1 className="AISearchResults-title">AI Search Results</h1>

					<p className="AISearchResults-meta">
						Query: <strong>{q || '(empty query)'}</strong> | Type:{' '}
						<strong>{type}</strong> | Speaker: <strong>{speaker}</strong> |
						Date: <strong>{date}</strong>
					</p>

					{data.length === 0 && (
						<div className="AISearchResults-stateCard">
							<p className="AISearchResults-stateText">No results found.</p>
						</div>
					)}

					{data.length > 0 && (
						<div className="AISearchResults-list">
							{data.map(item => (
								<SearchResultCard key={item.id} result={item} />
							))}
						</div>
					)}
				</div>
			</main>
		</MainLayout>
	);
}
