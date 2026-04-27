import { Icon } from '@iconify-icon/react';
import { useNavigate } from 'react-router';
import type { SearchResult } from '$/AISearchResults';
import './SearchResultCard.css';

interface SearchResultCardProps {
	result: SearchResult;
}

export default function SearchResultCard({ result }: SearchResultCardProps) {
	const navigate = useNavigate();

	function openChat() {
		const params = new URLSearchParams({
			sermonId: String(result.id),
			title: result.title,
			speaker: result.speaker,
			date: result.date,
			snippet: result.summary,
		});
		navigate(`/ai-chat?${params.toString()}`);
	}

	return (
		<article className="SearchResultCard">
			<div className="SearchResultCard-row">
				<div className="SearchResultCard-main">
					<h2 className="SearchResultCard-title">{result.title}</h2>

					<p className="SearchResultCard-meta">
						{result.type} • {result.speaker} • {result.date}
					</p>

					<p className="SearchResultCard-summary">{result.summary}</p>
				</div>

				<div className="SearchResultCard-actions">
					<div className="SearchResultCard-score">
						AI Score: {result.ai_score.toFixed(2)}
					</div>
					<button
						type="button"
						className="SearchResultCard-chat"
						title="Ask AI about this sermon"
						onClick={openChat}
					>
						<Icon icon="lucide:message-circle" width={16} height={16} />
					</button>
				</div>
			</div>
		</article>
	);
}
