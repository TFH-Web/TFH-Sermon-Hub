import { useState } from 'react';
import './SermonDetail.css';
import Button from '$/components/Button';
import MainLayout from '$/components/MainLayout';
import { Card } from './components/Card.tsx';
import FileUploadButton from './components/FileUploadButton.tsx';
import Tag from './components/Tag.tsx';
import { useToast } from './components/ToastContext.tsx';
import type { Sermon } from './types/sermon';

const mockSermon: Sermon = {
	id: 0,
	title: 'The Foundation of Grace',
	speaker: 'Dave Patterson',
	series: 'Live Your Best Life',
	date: new Date('2026-04-13'),
	tags: ['grace', 'faith', 'purpose'],
	status: 'Published',
	duration: 0,
};

const mockTranscript = [
	"Good morning everyone. I'm so glad you're here today. We're continuing our series \"Live Your Best Life\" and today we're talking about something that is at the foundation of everything — grace.",
	"A lot of people misunderstand what grace really means. It's not just a theological concept. Grace is the operating system of the Kingdom of God.",
	'Let me read from Ephesians 2:8-9. "For it is by grace you have been saved, through faith — and this is not from yourselves, it is the gift of God."',
	'Three things about living under grace: grace is not earned, grace changes your identity, and grace empowers your purpose ...',
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

	return (
		<MainLayout title="Sermon Detail">
			<div className="SermonDetail-grid">
				<Card className="SermonDetail-transcriptCard">
					<div className="SermonDetail-transcript-header">
						<h2 className="SermonDetail-transcript-title">Transcript</h2>
						<div className="SermonDetail-transcript-actions">
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
								{highlightKeywords(paragraph, mockSermon.tags)}
							</p>
						))}
					</div>
				</Card>
			</div>
		</MainLayout>
	);
}
