import { useState } from 'react';
import './SermonDetail.css';
import { useNavigate, useParams } from 'react-router';
import Button from '$/components/Button';
import MainLayout from '$/components/MainLayout';
import { Card } from './components/Card.tsx';
import FileUploadButton from './components/FileUploadButton.tsx';
import Tag from './components/Tag.tsx';
import { useToast } from './components/ToastContext.tsx';
import { sermons } from './data/sermons.ts';
import DeleteSermonModal from './modals/DeleteSermonModal.tsx';
import EditSermonModal from './modals/EditSermonModal.tsx';
import { durationToString } from './types/sermon';

// TODO: Add missing fields to sermon type when we're integrating w/ backend
const mockSermon = {
	seriesIndex: 4,
	seriesTotal: 6,
	videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	transcriptStatus: 'Generated',
	summaryStatus: 'Generated',
};

// TODO: add transcript to sermon type when we're integrating w/ backend
const mockTranscript = [
	"Good morning everyone. I'm so glad you're here today. We're continuing our series \"Live Your Best Life\" and today we're talking about something that is at the foundation of everything — grace.",
	"A lot of people misunderstand what grace really means. It's not just a theological concept. Grace is the operating system of the Kingdom of God.",
	'Let me read from Ephesians 2:8-9. "For it is by grace you have been saved, through faith — and this is not from yourselves, it is the gift of God."',
	'Three things about living under grace: grace is not earned, grace changes your identity, and grace empowers your purpose ...',
];

// TODO: add summary to sermon type when we're integrating w/ backend
const mockSummary = [
	'Pastor Dave Patterson explores grace as the foundation of Christian living.',
	' The sermon covers three main points: grace cannot be earned, grace transforms identity, and grace empowers believers to fulfill their purpose. ',
	'Drawing from Ephesians 2:8-9, Patterson emphasizes that understanding grace should change how we relate to God and each other.',
];

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

export default function SermonDetail() {
	const { showToast } = useToast();
	const [_transcript, setTranscript] = useState('');
	const [_summary, setSummary] = useState(mockSummary.join(' '));
	const { id } = useParams();
	const sermon = sermons.find(s => s.id.toString() === id);
	const [isEditingSummary, setIsEditingSummary] = useState(false);
	const [editSermonOpen, setEditSermonOpen] = useState(false);
	const [deleteSermonOpen, setDeleteSermonOpen] = useState(false);
	const navigate = useNavigate();

	if (!sermon) {
		throw new Error('Not found');
	}

	return (
		<MainLayout title={sermon.title}>
			<button
				type="button"
				className="SermonDetail-back"
				onClick={() => navigate('/sermons')}
			>
				← Back to Sermons
			</button>
			<div className="SermonDetail-grid">
				<div className="SermonDetail-video-container">
					<div className="SermonDetail-top">
						<div className="SermonDetail-videoPlaceholder">
							<div className="SermonDetail-playButton">▶</div>
						</div>
						<div className="SermonDetail-info">
							{sermon.series && (
								<p className="SermonDetail-series">{sermon.series} Series</p>
							)}
							<h1 className="SermonDetail-title">{sermon.title}</h1>
							<p className="SermonDetail-meta">
								{sermon.speaker}
								{' • '}
								{sermon.date.toLocaleDateString('en-US', {
									month: 'short',
									day: 'numeric',
									year: 'numeric',
								})}
								{sermon.duration
									? ` • ${durationToString(sermon.duration)}`
									: ''}
							</p>
							<div className="SermonDetail-tags">
								{sermon.tags.map(tag => (
									<Tag key={tag} variant="solid">
										{tag}
									</Tag>
								))}
							</div>
							<div className="SermonDetail-btn-group">
								<Button variant="primary">Watch</Button>
								<Button
									variant="secondary"
									onClick={() => setEditSermonOpen(true)}
								>
									Edit
								</Button>
								<Button
									variant="danger"
									onClick={() => setDeleteSermonOpen(true)}
								>
									Delete
								</Button>
							</div>
						</div>
					</div>
				</div>
				{/* Transcript Section */}
				<Card className="SermonDetail-transcript">
					<div className="SermonDetail-card-header">
						<h2 className="SermonDetail-card-title">Transcript</h2>
						<div className="SermonDetail-card-actions">
							<Button variant="ghost" className="SermonDetail-copy-btn">
								Copy
							</Button>
							<FileUploadButton
								onFileRead={setTranscript}
								className="SermonDetail-upload-button"
							>
								Upload Transcript
							</FileUploadButton>
						</div>
					</div>

					<div className="SermonDetail-transcript-ai">
						<span>
							<Tag variant="blue">AI Generated</Tag>
						</span>
						<span>
							<Button
								variant="ghost"
								className="SermonDetail-regenerate-btn"
								onClick={() =>
									showToast('Regenerating transcript via AI...', 'info')
								}
							>
								Regenerate with AI
							</Button>
						</span>
					</div>

					<div className="SermonDetail-transcript-container">
						{mockTranscript.map(paragraph => (
							<p key={paragraph} className="SermonDetail-transcript-paragraph">
								{highlightKeywords(paragraph, sermon.tags)}
							</p>
						))}
					</div>
				</Card>

				{/* Summary Section */}
				<Card className="SermonDetail-summary">
					<div className="SermonDetail-card-header">
						<h2 className="SermonDetail-card-title">Summary</h2>
						<div className="SermonDetail-card-actions">
							<Tag variant="blue">AI Generated</Tag>
							<Button
								variant="ghost"
								className="SermonDetail-regenerate-btn"
								onClick={() =>
									showToast('Regenerating summary via AI...', 'info')
								}
							>
								Regenerate with AI
							</Button>
						</div>
					</div>
					<div className="SermonDetail-summary-container">
						<p className="SermonDetail-summary-paragraph">{mockSummary}</p>
					</div>
					<div className="SermonDetail-summary-edit-container">
						{isEditingSummary ? (
							<div className="SermonDetail-summary-editing">
								<Button
									variant="secondary"
									className="SermonDetail-summary-btn"
									onClick={() => setIsEditingSummary(false)}
								>
									Edit Summary Manually
								</Button>
								<textarea
									className="SermonDetail-summary-textarea"
									value={_summary}
									onChange={e => setSummary(e.target.value)}
								/>
							</div>
						) : (
							<Button
								variant="secondary"
								className="SermonDetail-summary-btn"
								onClick={() => setIsEditingSummary(true)}
							>
								Edit Summary Manually
							</Button>
						)}
					</div>
				</Card>

				{/* Metadata Section */}
				<Card className="SermonDetail-metadata">
					<div className="SermonDetail-card-header">
						<h2 className="SermonDetail-card-title">Metadata</h2>
					</div>
					<div className="SermonDetail-metadata-body">
						<span className="SermonDetail-metadata-label">Series</span>
						<span className="SermonDetail-metadata-value">{sermon.series}</span>

						<span className="SermonDetail-metadata-label">Series Index</span>
						<span className="SermonDetail-metadata-value">
							#{mockSermon.seriesIndex} of {mockSermon.seriesTotal}
						</span>

						<span className="SermonDetail-metadata-label">Speaker</span>
						<span className="SermonDetail-metadata-value">
							{sermon.speaker}
						</span>

						<span className="SermonDetail-metadata-label">Date</span>
						<span className="SermonDetail-metadata-value">
							{sermon.date.toLocaleDateString('en-US', {
								month: 'long',
								day: 'numeric',
								year: 'numeric',
							})}
						</span>

						<span className="SermonDetail-metadata-label">Duration</span>
						<span className="SermonDetail-metadata-value">
							{durationToString(sermon.duration)}
						</span>

						<span className="SermonDetail-metadata-label">Video</span>
						<span className="SermonDetail-metadata-value">
							<a
								href={mockSermon.videoUrl}
								target="_blank"
								rel="noreferrer"
								className="SermonDetail-metadata-link"
							>
								{mockSermon.videoUrl.replace('https://', '')}
							</a>
						</span>

						<span className="SermonDetail-metadata-label">Transcript</span>
						<span className="SermonDetail-metadata-value">
							<Tag variant="green">{mockSermon.transcriptStatus}</Tag>
						</span>

						<span className="SermonDetail-metadata-label">Summary</span>
						<span className="SermonDetail-metadata-value">
							<Tag variant="green">{mockSermon.summaryStatus}</Tag>
						</span>

						<span className="SermonDetail-metadata-label">Tags</span>
						<span className="SermonDetail-metadata-value">
							<Tag variant="green">AI Generated ({sermon.tags.length})</Tag>
						</span>
					</div>
				</Card>
			</div>

			{/* Edit and Delete buttons */}
			<EditSermonModal
				isOpen={editSermonOpen}
				onClose={() => setEditSermonOpen(false)}
				sermon={sermon}
			/>

			<DeleteSermonModal
				isOpen={deleteSermonOpen}
				onClose={() => setDeleteSermonOpen(false)}
				sermon={sermon}
			/>
		</MainLayout>
	);
}
