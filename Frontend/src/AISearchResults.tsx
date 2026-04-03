import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '$/components/MainLayout';

type SearchResult = {
	id: number;
	title: string;
	type: string;
	speaker: string;
	date: string;
	summary: string;
	ai_score: number;
};

async function fetchResults(
	q: string,
	type: string,
	speaker: string,
	date: string,
): Promise<SearchResult[]> {
	const res = await axios.get<SearchResult[]>('/api/search', {
		params: { q, type, speaker, date },
	});
	return res.data;
}

export default function AISearchResults() {
	const [searchParams] = useSearchParams();

	const q = searchParams.get('q') ?? '';
	const type = searchParams.get('type') ?? 'all';
	const speaker = searchParams.get('speaker') ?? 'any';
	const date = searchParams.get('date') ?? 'any';

	const { data, isLoading, isError } = useQuery({
		queryKey: ['search-results', q, type, speaker, date],
		queryFn: () => fetchResults(q, type, speaker, date),
	});

	return (
		<MainLayout title="AI Search Results">
			<main
				style={{
					minHeight: '100vh',
					background: '#f3f3f1',
					padding: '48px 24px',
					fontFamily: 'sans-serif',
				}}
			>
				<div style={{ maxWidth: '900px', margin: '0 auto' }}>
					<h1 style={{ marginBottom: '8px' }}>AI Search Results</h1>
					<p style={{ color: '#666', marginBottom: '24px' }}>
						Query: <strong>{q || '(empty query)'}</strong> | Type:{' '}
						<strong>{type}</strong> | Speaker: <strong>{speaker}</strong> |
						Date: <strong>{date}</strong>
					</p>

					{isLoading && <p>Loading results...</p>}
					{isError && <p>Could not load results.</p>}
					{data && data.length === 0 && <p>No results found.</p>}

					{data && data.length > 0 && (
						<div style={{ display: 'grid', gap: '16px' }}>
							{data.map(item => (
								<article
									key={item.id}
									style={{
										background: 'white',
										borderRadius: '12px',
										padding: '20px',
										border: '1px solid #ddd',
									}}
								>
									<div
										style={{
											display: 'flex',
											justifyContent: 'space-between',
											gap: '16px',
											alignItems: 'start',
										}}
									>
										<div>
											<h2 style={{ margin: '0 0 8px 0' }}>{item.title}</h2>
											<p style={{ margin: '0 0 8px 0', color: '#666' }}>
												{item.type} • {item.speaker} • {item.date}
											</p>
											<p style={{ margin: 0, color: '#444' }}>{item.summary}</p>
										</div>
										<div
											style={{
												minWidth: '120px',
												textAlign: 'right',
												color: '#6f865f',
												fontWeight: 700,
											}}
										>
											AI Score: {item.ai_score.toFixed(2)}
										</div>
									</div>
								</article>
							))}
						</div>
					)}
				</div>
			</main>
		</MainLayout>
	);
}
