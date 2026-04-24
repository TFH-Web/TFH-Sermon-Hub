import type { KeyboardEvent, MouseEvent } from 'react';
import type { AISearchResultPreview } from '$/types/aiSearch';
import './AISearchPreviewCard.css';

interface AISearchPreviewCardProps {
	result: AISearchResultPreview;
	onOpen: (result: AISearchResultPreview) => void;
}

export default function AISearchPreviewCard({
	result,
	onOpen,
}: AISearchPreviewCardProps) {
	function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onOpen(result);
		}
	}

	function handleChatClick(e: MouseEvent<HTMLButtonElement>) {
		e.stopPropagation();
	}

	return (
		<article
			className="AISearchPreviewCard"
			role="button"
			tabIndex={0}
			onClick={() => onOpen(result)}
			onKeyDown={handleKeyDown}
		>
			<div className="AISearchPreviewCard-thumb" aria-hidden="true" />

			<div className="AISearchPreviewCard-main">
				<h2 className="AISearchPreviewCard-title">{result.title}</h2>

				<p className="AISearchPreviewCard-meta">
					{result.speaker} • {result.date} • {result.series}
				</p>

				<p className="AISearchPreviewCard-snippet">{result.snippet}</p>

				<div className="AISearchPreviewCard-tags">
					<span className="AISearchPreviewCard-tag AISearchPreviewCard-tag--match">
						{result.match}% match
					</span>

					<span className="AISearchPreviewCard-tag">{result.contentType}</span>
				</div>
			</div>

			<button
				type="button"
				className="AISearchPreviewCard-chatButton"
				onClick={handleChatClick}
				aria-label="AI chat coming soon"
				title="AI chat coming soon"
			>
				<span className="AISearchPreviewCard-chatBubble" aria-hidden="true" />
			</button>
		</article>
	);
}
