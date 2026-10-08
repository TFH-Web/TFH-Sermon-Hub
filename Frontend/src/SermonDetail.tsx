import { useQuery } from '@tanstack/react-query'; // tool to ask the server for data or if its broken or still waiting
import axios from 'axios'; // Sends the HTTP request to the backend
import { useState } from 'react'; // Allows the page remember things that changed like if something was enabled or disabled

import './SermonDetail.css';
import { useNavigate, useParams } from 'react-router';
import Button from '$/components/Button';
import { Card } from '$/components/Card.tsx';
import ErrorBox from '$/components/ErrorBox.tsx';
import Loading from '$/components/Loading.tsx';
import MainLayout from '$/components/MainLayout';
import SermonTranscript from '$/components/SermonTranscript';
import Tag from '$/components/Tag.tsx';
import { useToast } from '$/components/ToastContext.tsx';
import DeleteSermonModal from '$/modals/DeleteSermonModal.tsx';
import EditSermonModal from '$/modals/EditSermonModal.tsx';
import { durationToString, Sermon } from '$/types/sermon';
import { getFullName } from '$/types/speaker.ts';

// The server sends the summary as one long piece of text, but the page shows separate paragraphs.
// A blank line is the only thing marking where a paragraph ends, so split on those and throw away the empty pieces.
function toParagraphs(text: string) {
	return text
		.split(/\n\s*\n/)
		.map(paragraph => paragraph.trim())
		.filter(paragraph => paragraph.length > 0);
}

// A 404 from the server means "no sermon has that id". We treat that differently from a real failure.
function isNotFound(error: unknown): boolean {
	return axios.isAxiosError(error) && error.response?.status === 404;
}

export default function SermonDetail() {
	const { showToast } = useToast(); // let's up pop up a little message at the corner of the screen

	const [_summary, setSummary] = useState<string | null>(null); // Starts as nothing. It only holds text once the user types their own summary.

	const { id } = useParams(); // reads the number of the web address, so /sermons/5 gives us 5
	const [isEditingSummary, setIsEditingSummary] = useState(false); // Remembers if the summary edit box is open
	const [editSermonOpen, setEditSermonOpen] = useState(false); //	Remembers if the Edit popup is open
	const [deleteSermonOpen, setDeleteSermonOpen] = useState(false); // Remembers if the Delete popup is open
	const navigate = useNavigate(); // Lets us send the user to a different page

	// What it does: go ask the server for this one sermon's information
	const query = useQuery({
		// Cache label. The id is included so each sermon is stored separately and not get mixed up
		queryKey: ['sermon', id],
		queryFn: async () => {
			// Ask the server: "give me the sermon with this number"
			const res = await axios.get(`/api/sermons/${id}`);
			// Make sure the server sent what we expect, and turn its date text into a real date the page can display
			return await Sermon.parseAsync(res.data);
		},
		// A sermon that does not exist will still not exist on the third try, so only keep trying for real failures like the server being down.
		retry: (failureCount, error) => !isNotFound(error) && failureCount < 3,
		refetchInterval: query =>
			query.state.data?.status === 'Processing' ? 2000 : false,
	});

	//ask server for data of all sermons
	const sermonsQuery = useQuery({
		queryKey: ['sermons'],
		queryFn: async () => {
			const res = await axios.get(`/api/sermons`);
			// setSermons(await Sermon.array().parseAsync(res.data));
			return await Sermon.array().parseAsync(res.data);
		},
		// A sermon that does not exist will still not exist on the third try, so only keep trying for real failures like the server being down.
		retry: (failureCount, error) => !isNotFound(error) && failureCount < 3,
	});

	// Shared spinner, same as every other page. No more plain "Loading...." text.
	if (query.isPending || sermonsQuery.isPending) {
		return (
			<MainLayout title="Sermon">
				<Loading vertical />
			</MainLayout>
		);
	}

	// Handled here rather than thrown, so the app-wide error screen in main.tsx does not take over and blank out the whole page.
	if (isNotFound(query.error || sermonsQuery.error)) {
		return (
			<MainLayout title="Sermon not found">
				<button
					type="button"
					className="SermonDetail-back"
					onClick={() => navigate('/sermons')}
				>
					← Back to Sermons
				</button>
				<p>There is no sermon with that id {id}.</p>
			</MainLayout>
		);
	}

	// Server's down or sent back something broken. A 404 is handled above.
	// Separately since retrying a sermon that doesn't exist won't help.
	if (query.isError || sermonsQuery.isError) {
		return (
			<MainLayout title="Sermon">
				<ErrorBox
					message="Failed to load this sermon."
					onRetry={() => query.refetch()}
				/>
			</MainLayout>
		);
	}

	// We got the sermon data.
	const sermon = query.data;
	// We got the data of all the sermons
	const sermons = sermonsQuery.data ?? [];

	// The server sends one long block of text. Cut it into separate paragraphs so the page can show them one under the other.
	// If the sermon has no summary saved, we end up with nothing to show.
	const summaryParagraphs = sermon.summary ? toParagraphs(sermon.summary) : [];

	// Filters list of sermons to a new array containing only sermons in the same series
	// const [filteredSermons, setFilteredSermons] = useState<Sermon[]>([]);
	let filteredSermons: Sermon[] = [];

	// Pushes sermon from sermons into filteredSermons if it is in the same series as our main sermon
	if (sermon.series) {
		sermons.forEach(s => {
			if (s.series?.id === sermon.series?.id) {
				filteredSermons.push(s as Sermon);
			}
		});
	}

	// Sorts sermons by date, then by ID
	filteredSermons = filteredSermons.sort((a, b) => {
		const dateDiff = a.date.getTime() - b.date.getTime();
		if (dateDiff !== 0) {
			return dateDiff;
		}
		return a.id - b.id;
	});

	// Sets seriesTotal and seriesIndex based on filteredSermons
	let seriesTotal: number;
	let seriesIndex: number;
	// Set both seriesTotal and seriesIndex to 1 if sermon does not have a series
	if (filteredSermons.length < 1) {
		seriesTotal = 1;
		seriesIndex = 1;
	} else {
		seriesTotal = filteredSermons.length;
		seriesIndex = filteredSermons.findIndex(item => item.id === sermon.id) + 1; // Add 1 to the index to offset zero-indexing
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
								<p className="SermonDetail-series">
									{sermon.series.title} Series
								</p>
							)}
							<h1 className="SermonDetail-title">{sermon.title}</h1>
							<p className="SermonDetail-meta">
								{getFullName(sermon.speaker)}
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
									<Tag key={tag.name} variant="solid">
										{tag.name}
									</Tag>
								))}
							</div>
							<div className="SermonDetail-btn-group">
								<a
									className="Button Button--primary"
									href={sermon.videoLink}
									target="_blank"
									rel="noreferrer"
								>
									Watch
								</a>
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
				<SermonTranscript sermon={sermon} />

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
						{/* Same idea as the transcript. Say there is no summary rather than showing an empty panel. */}
						{summaryParagraphs.length > 0 ? (
							summaryParagraphs.map(paragraph => (
								<p key={paragraph} className="SermonDetail-summary-paragraph">
									{paragraph}
								</p>
							))
						) : (
							<p className="SermonDetail-summary-paragraph">
								No summary yet. Generate one with AI.
							</p>
						)}
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
									value={_summary ?? sermon.summary ?? ''}
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
						<span className="SermonDetail-metadata-value">
							{sermon.series?.title ?? '–'}
						</span>

						<span className="SermonDetail-metadata-label">Series Index</span>
						<span className="SermonDetail-metadata-value">
							#{seriesIndex} of {seriesTotal}
						</span>

						<span className="SermonDetail-metadata-label">Speaker</span>
						<span className="SermonDetail-metadata-value">
							{getFullName(sermon.speaker)}
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
						{/* The real video address from the server, shown without the https:// */}
						<span className="SermonDetail-metadata-value">
							<a
								href={sermon.videoLink}
								target="_blank"
								rel="noreferrer"
								className="SermonDetail-metadata-link"
							>
								{sermon.videoLink.replace('https://', '')}
							</a>
						</span>

						<span className="SermonDetail-metadata-label">Transcript</span>
						{/* Only say "Generated" if a transcript really exists.
						Most sermons in the database do not have one yet. */}
						<span className="SermonDetail-metadata-value">
							{sermon.transcript ? (
								<Tag variant="green">Generated</Tag>
							) : (
								<Tag variant="amber">Not generated</Tag>
							)}
						</span>

						<span className="SermonDetail-metadata-label">Summary</span>
						{/* Same idea for the summary */}
						<span className="SermonDetail-metadata-value">
							{sermon.summary ? (
								<Tag variant="green">Generated</Tag>
							) : (
								<Tag variant="amber">Not generated</Tag>
							)}
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
