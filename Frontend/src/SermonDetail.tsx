import { useState } from 'react';
import './SermonDetail.css';
import Button from '$/components/Button';
import { Card } from '$/components/Card';
import FileUploadButton from '$/components/FileUploadButton';
import Modal from '$/components/Modal';
import Tag from '$/components/Tag';
import type { Sermon } from '$/types/sermon';

interface SermonDetailProps {
	isOpen: boolean;
	onClose: () => void;
	sermon: Sermon | null;
}

// Mock transcripts for the mockup, backup will handle later
const mockTranscript = [
	"Good morning everyone. I'm so glad you're here today. We're continuing our series \"Live Your Best Life\" and today we're talking about something that is at the foundation of everything — grace.",
	"A lot of people misunderstand what grace really means. It's not just a theological concept. Grace is the operating system of the Kingdom of God.",
	'Let me read from Ephesians 2:8-9. "For it is by grace you have been saved, through faith — and this is not from yourselves, it is the gift of God."',
	'Three things about living under grace: grace is not earned, grace changes your identity, and grace empowers your purpose ...',
];

// Mock summary, to change later as well
const mockSummary =
	'Pastor Dave Patterson explores grace as the foundation of Christian living. The sermon covers three main points: grace cannot be earned, grace transforms identity, and grace empowers believers to fulfill ' +
	'their purpose. Drawing from Ephesians 2:8-9, Patterson emphasizes that understanding grace should change how we relate to God and each other.';

// Matching keywords are wrapped in a highlight span inside the transcipt
function highlightKeywords(text: string, keywords: string[]) {
	const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
	const parts = text.split(pattern);

	let offset = 0;
	return parts.map(part => {
		const key = offset;
		offset += part.length;
		const isKeyword = keywords.some(
			k => k.toLowerCase() === part.toLowerCase(),
		);
		if (isKeyword) {
			return (
				<span key={key} className="SermonDetail-keyword">
					{part}
				</span>
			);
		}
		return part;
	});
}

// Date is formated for the metadata table
function formatDateLong(date: Date): string {
	return Intl.DateTimeFormat('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
	}).format(date);
}

// Date is formatted for the top meta line
function formatDateShort(date: Date): string {
	return Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	}).format(date);
}

export default function SermonDetail({
	isOpen,
	onClose,
	sermon,
}: SermonDetailProps) {
	const [_transcript, setTranscript] = useState('');

	// Renders nothing if there isn't a selected sermon
	if (!sermon) return null;

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			size="lg"
			className="SermonDetail-modal"
		>
			<div className="SermonDetail">
				{/* Back button to close the modal */}
				<button type="button" className="SermonDetail-back" onClick={onClose}>
					← Back to Sermons
				</button>

				{/* Top Portion, Video is on the left, Info is on the right */}
				<div className="SermonDetail-top">
					{/* Left Side, gray video placeholder with centered play button */}
					<div className="SermonDetail-videoPlaceholder">
						<div className="SermonDetail-playButton">▶</div>
					</div>

					{/* Right side, sermon metadata is stacked vertically */}
					<div className="SermonDetail-info">
						{/* Sermon series label */}
						{sermon.series && (
							<p className="SermonDetail-series">{sermon.series} Series</p>
						)}

						{/* Title */}
						<h1 className="SermonDetail-title">{sermon.title}</h1>

						{/* Speaker, date, and duration listed on the same line */}
						<p className="SermonDetail-meta">
							{sermon.speaker}
							{' • '}
							{'  Date: '}
							{formatDateShort(sermon.date)}
							{sermon.duration
								? `  •  Duration: ${Math.round(sermon.duration / 60)} min`
								: ''}
						</p>

						{/* Description, mock placeholder for now */}
						<p className="SermonDetail-description">
							Exploring the transformative power of grace and how it shapes our
							everyday decisions, relationships, and connection to God's purpose
							for our lives.
						</p>

						{/* Tag pills */}
						<div className="SermonDetail-tags">
							{sermon.tags.map(tag => (
								<Tag key={tag} variant="solid">
									{tag}
								</Tag>
							))}
						</div>

						{/* Action buttons */}
						<div className="SermonDetail-actions">
							{/* Primary button, green filled */}
							<Button variant="primary" className="SermonDetail-watchBtn">
								Watch
							</Button>
							{/* Secondary button, outlined */}
							<Button variant="secondary" className="SermonDetail-editBtn">
								Edit
							</Button>
							{/* Delete button, red */}
							<Button variant="ghost" className="SermonDetail-deleteBtn">
								Delete
							</Button>
						</div>
					</div>
				</div>

				{/* Bottom Section; Transcript on the left and summary + Metadata on the right */}
				<div className="SermonDetail-bottom">
					{/* Left Side - Transcript */}
					<Card className="SermonDetail-transcriptCard">
						{/* Title, copy, and upload button */}
						<div className="SermonDetail-transcriptHeader">
							<h2 className="SermonDetail-cardTitle">Transcript</h2>
							<div className="SermonDetail-transcriptHeaderActions">
								<Button
									variant="ghost"
									className="SermonDetail-copyBtn"
									onClick={() =>
										navigator.clipboard.writeText(mockTranscript.join('\n\n'))
									}
								>
									Copy
								</Button>
								<FileUploadButton
									onFileRead={setTranscript}
									className="SermonDetail-uploadBtn"
								>
									Upload Transcript
								</FileUploadButton>
							</div>
						</div>

						{/* AI tag and the regenerate buttons */}
						<div className="SermonDetail-transcriptAiRow">
							<Tag variant="blue">AI Generated</Tag>
							<Button variant="ghost" className="SermonDetail-regenerateBtn">
								Regenerate with AI
							</Button>
						</div>

						{/* Scrollable Transcript Body */}
						<div className="SermonDetail-transcriptBody">
							{mockTranscript.map(paragraph => (
								<p key={paragraph} className="SermonDetail-paragraph">
									{highlightKeywords(paragraph, sermon.tags)}
								</p>
							))}
						</div>
					</Card>

					{/* Right Column */}
					<div className="SermonDetail-rightColumn">
						{/* Summary card */}
						<Card className="SermonDetail-summaryCard">
							{/* Title, AI tag, regenerate button */}
							<div className="SermonDetail-summaryHeader">
								<h2 className="SermonDetail-cardTitle">Summary</h2>
								<div className="SermonDetail-summaryHeaderActions">
									<Tag variant="blue">AI Generated</Tag>
									<Button
										variant="ghost"
										className="SermonDetail-regenerateBtn"
									>
										Regenerate with AI
									</Button>
								</div>
							</div>

							{/* Summary paragraph */}
							<p className="SermonDetail-summaryText">{mockSummary}</p>

							{/* Manual edit button below summary */}
							<Button
								variant="secondary"
								className="SermonDetail-editSummaryBtn"
							>
								Edit Summary Manually
							</Button>
						</Card>

						{/* Metadata Card */}
						<Card className="SermonDetail-metadataCard">
							<h2 className="SermonDetail-cardTitle">Metadata</h2>

							{/* Each row is label on left, value on right */}
							<div className="SermonDetail-metadataRows">
								<div className="SermonDetail-metaRow">
									<span className="SermonDetail-metaLabel">Series</span>
									<span className="SermonDetail-metaValue">
										{sermon.series ?? '—'}
									</span>
								</div>

								{/* Series index is mocked for now */}
								<div className="SermonDetail-metaRow">
									<span className="SermonDetail-metaLabel">Series Index</span>
									<span className="SermonDetail-metaValue">#4 of 6</span>
								</div>

								<div className="SermonDetail-metaRow">
									<span className="SermonDetail-metaLabel">Speaker</span>
									<span className="SermonDetail-metaValue">
										{sermon.speaker}
									</span>
								</div>

								<div className="SermonDetail-metaRow">
									<span className="SermonDetail-metaLabel">Date</span>
									<span className="SermonDetail-metaValue">
										{formatDateLong(sermon.date)}
									</span>
								</div>

								<div className="SermonDetail-metaRow">
									<span className="SermonDetail-metaLabel">Duration</span>
									{/* Mocked data for now */}
									<span className="SermonDetail-metaValue">42:18</span>
								</div>

								<div className="SermonDetail-metaRow">
									<span className="SermonDetail-metaLabel">Video</span>
									{/* Mocked YouTube link */}
									<a
										className="SermonDetail-metaLink"
										href="https://youtube.com/watch?v=abc123"
										target="_blank"
										rel="noreferrer"
									>
										youtube.com/watch?v=abc123
									</a>
								</div>

								<div className="SermonDetail-metaRow">
									<span className="SermonDetail-metaLabel">Transcript</span>
									<Tag variant="solid">Generated</Tag>
								</div>

								<div className="SermonDetail-metaRow">
									<span className="SermonDetail-metaLabel">Summary</span>
									<Tag variant="solid">Generated</Tag>
								</div>

								<div className="SermonDetail-metaRow">
									<span className="SermonDetail-metaLabel">Tags</span>
									<Tag variant="solid">AI Generated ({sermon.tags.length})</Tag>
								</div>
							</div>
						</Card>
					</div>
				</div>
			</div>
		</Modal>
	);
}
