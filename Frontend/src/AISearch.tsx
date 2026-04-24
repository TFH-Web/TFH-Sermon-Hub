import { useNavigate } from 'react-router-dom';
import AISearchPreviewCard from '$/components/AISearchPreviewCard';
import MainLayout from '$/components/MainLayout';
import SearchBar from '$/components/SearchBar';
import SearchFilters from '$/components/SearchFilters';
import useAISearch from '$/hooks/useAISearch';
import type { AISearchResultPreview } from '$/types/aiSearch';
import './AISearch.css';

export default function AISearch() {
	const navigate = useNavigate();

	const {
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
	} = useAISearch();

	function handleCardClick(item: AISearchResultPreview) {
		navigate(item.redirectTo);
	}

	return (
		<MainLayout title="AI Search">
			<section className="AISearch">
				<h1 className="AISearch-title">AI-Powered Sermon Search</h1>

				<p className="AISearch-subtitle">
					Natural language search across transcripts, tags, speakers, and topics
				</p>

				<form onSubmit={handleSubmit} className="AISearch-form">
					<SearchBar query={query} onQueryChange={setQuery} />

					<SearchFilters
						contentOptions={contentOptions}
						type={type}
						onTypeChange={setType}
						speaker={speaker}
						onSpeakerChange={setSpeaker}
						date={date}
						onDateChange={setDate}
					/>
				</form>

				{showResults && (
					<section className="AISearch-results" aria-live="polite">
						<p className="AISearch-resultsMeta">
							Found <strong>{visibleResults.length} results</strong> for "
							{submittedQuery}" — ranked by relevance
						</p>

						<div className="AISearch-resultsList">
							{visibleResults.map(item => (
								<AISearchPreviewCard
									key={item.id}
									result={item}
									onOpen={handleCardClick}
								/>
							))}
						</div>
					</section>
				)}
			</section>
		</MainLayout>
	);
}
