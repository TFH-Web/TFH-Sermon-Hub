import { useNavigate } from 'react-router-dom';
import AISearchPreviewCard from '$/components/AISearchPreviewCard';
import ErrorBox from '$/components/ErrorBox';
import Loading from '$/components/Loading';
import MainLayout from '$/components/MainLayout';
import SearchBar from '$/components/SearchBar';
import SearchFilters from '$/components/SearchFilters';
import useAISearch from '$/hooks/useAISearchPage';
import type { AISearchResultPreview } from '$/types/aiSearch';
import './AISearch.css';

export default function AISearch() {
	const navigate = useNavigate();

	// Get the form values, results, and request status.
	const {
		query,
		setQuery,
		type,
		setType,
		speaker,
		setSpeaker,
		date,
		setDate,
		page,
		setPage,
		showResults,
		submittedQuery,
		contentOptions,
		visibleResults,
		total,
		totalPages,
		isLoading,
		isError,
		retry,
		handleSubmit,
	} = useAISearch();

	// Open the sermon selected by the user.
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

				{/* Submit the query and let users select search filters. */}
				<form className="AISearch-form" onSubmit={handleSubmit}>
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

				{/* Show results and request states after the first search. */}
				{showResults && (
					<section
						className="AISearch-results"
						aria-live="polite"
						aria-busy={isLoading}
					>
						{isLoading ? (
							<Loading />
						) : isError ? (
							<div>
								<ErrorBox message="Unable to search sermons. Please try again." />
								<button type="button" onClick={retry}>
									Retry
								</button>
							</div>
						) : (
							<>
								<p className="AISearch-resultsMeta">
									Found <strong>{total} results</strong> for
									{' "'}
									{submittedQuery}
									{'"'} — ranked by relevance
								</p>

								{/* Show a helpful message when the API returns no results. */}
								{visibleResults.length === 0 ? (
									<p>
										No results found. Try another query or change your filters.
									</p>
								) : (
									<div className="AISearch-resultsList">
										{visibleResults.map(item => (
											<AISearchPreviewCard
												key={item.id}
												result={item}
												onOpen={handleCardClick}
											/>
										))}
									</div>
								)}

								{/* Keep page navigation within the available pages. */}
								<nav aria-label="Search result pages">
									<button
										type="button"
										aria-label="Previous page"
										disabled={page <= 1 || totalPages === 0}
										onClick={() => setPage(page - 1)}
									>
										Previous
									</button>

									<span>
										{' '}
										Page {totalPages === 0 ? 0 : page} of {totalPages}{' '}
									</span>

									<button
										type="button"
										aria-label="Next page"
										disabled={page >= totalPages}
										onClick={() => setPage(page + 1)}
									>
										Next
									</button>
								</nav>
							</>
						)}
					</section>
				)}
			</section>
		</MainLayout>
	);
}
