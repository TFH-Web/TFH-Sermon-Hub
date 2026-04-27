import { Fragment, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AISearchVisibleResult } from '$/hooks/useAISearch';
import type { AISearchResultPreview } from '$/types/aiSearch';
import './AISearchPreviewCard.css';

interface AISearchPreviewCardProps {
	result: AISearchVisibleResult;
	onOpen: (result: AISearchResultPreview) => void;
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedText(text: string, matchTerms: string[]) {
	if (matchTerms.length === 0) {
		return text;
	}

	const pattern = new RegExp(
		`(${matchTerms
			.map(escapeRegExp)
			.sort((a, b) => b.length - a.length)
			.join('|')})`,
		'gi',
	);

	const parts: ReactNode[] = [];
	let lastIndex = 0;

	for (const match of text.matchAll(pattern)) {
		const matchText = match[0];
		const matchIndex = match.index ?? 0;

		if (matchIndex > lastIndex) {
			parts.push(
				<Fragment key={`text-${lastIndex}`}>
					{text.slice(lastIndex, matchIndex)}
				</Fragment>,
			);
		}

		parts.push(
			<mark
				key={`match-${matchIndex}-${matchText.toLowerCase()}`}
				className="AISearchPreviewCard-highlight"
			>
				{matchText}
			</mark>,
		);

		lastIndex = matchIndex + matchText.length;
	}

	if (lastIndex < text.length) {
		parts.push(
			<Fragment key={`text-${lastIndex}`}>{text.slice(lastIndex)}</Fragment>,
		);
	}

	return parts.length > 0 ? parts : text;
}

function previewImageUrl(result: AISearchResultPreview) {
	return (
		result.thumbnailUrl ??
		`https://unsplash.it/seed/${encodeURIComponent(result.title)}/1280/720`
	);
}

export default function AISearchPreviewCard({
	result,
	onOpen,
}: AISearchPreviewCardProps) {
	const navigate = useNavigate();

	function handleChatClick(e: MouseEvent<HTMLButtonElement>) {
		e.stopPropagation();
		const sermonId = result.redirectTo.split('/').pop();
		const params = new URLSearchParams({
			...(sermonId ? { sermonId } : {}),
			title: result.title,
			speaker: result.speaker,
			date: result.date,
			series: result.series,
			snippet: result.snippet,
		});
		navigate(`/ai-chat?${params.toString()}`);
	}

	return (
		<article className="AISearchPreviewCard">
			<button
				type="button"
				className="AISearchPreviewCard-open"
				onClick={() => onOpen(result)}
			>
				<img
					className="AISearchPreviewCard-thumb"
					src={previewImageUrl(result)}
					alt={`${result.title} preview`}
				/>

				<div className="AISearchPreviewCard-main">
					<h2 className="AISearchPreviewCard-title">{result.title}</h2>

					<p className="AISearchPreviewCard-meta">
						{result.speaker} • {result.date} • {result.series}
					</p>

					<p className="AISearchPreviewCard-snippet">
						{result.previewHasLeadingEllipsis ? '…' : ''}
						{renderHighlightedText(
							result.previewSnippet,
							result.previewMatchTerms,
						)}
						{result.previewHasTrailingEllipsis ? '…' : ''}
					</p>

					<div className="AISearchPreviewCard-tags">
						<span className="AISearchPreviewCard-tag AISearchPreviewCard-tag--match">
							{result.match}% match
						</span>

						<span className="AISearchPreviewCard-tag">
							{result.contentType}
						</span>
					</div>
				</div>
			</button>

			<button
				type="button"
				className="AISearchPreviewCard-chatButton"
				onClick={handleChatClick}
				aria-label={`Open AI chat for ${result.title}`}
				title={`Open AI chat for ${result.title}`}
			>
				<span className="AISearchPreviewCard-chatBubble" aria-hidden="true" />
			</button>
		</article>
	);
}
