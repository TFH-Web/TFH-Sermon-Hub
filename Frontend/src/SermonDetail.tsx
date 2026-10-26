import { useQuery } from '@tanstack/react-query'; // tool to ask the server for data or if its broken or still waiting
import axios from 'axios'; // Sends the HTTP request to the backend
import { useRef, useState } from 'react'; // Allows the page remember things that changed like if something was enabled or disabled

import './SermonDetail.css';
import { useNavigate, useParams } from 'react-router';
import type { YouTubeProps } from 'react-youtube';
import YouTube from 'react-youtube';
import Button from '$/components/Button';
import { Card } from '$/components/Card.tsx';
import ErrorBox from '$/components/ErrorBox.tsx';
import Loading from '$/components/Loading.tsx';
import MainLayout from '$/components/MainLayout';
import SermonTranscript from '$/components/SermonTranscript';
import Tag from '$/components/Tag.tsx';
import { useToast } from '$/components/ToastContext.tsx';
import { useIsAdmin } from '$/lib/auth';
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
	const isAdmin = useIsAdmin();
	const { showToast } = useToast(); // let's up pop up a little message at the corner of the screen

	const [summaryDraft, setSummaryDraft] = useState<{
		sermonId: string;
		text: string;
	} | null>(null); // Checks if there is a draft summary for the current sermon
	const [editingSermonID, setEditingSermonID] = useState<string | null>(null); // Tracks which sermon is currently being edited
	const [isSavingSummary, setIsSavingSummary] = useState(false); // Tracks if the summary is currently being saved

	const { id } = useParams(); // reads the number of the web address, so /sermons/5 gives us 5
	const [isEditingSummary, setIsEditingSummary] = useState(false); // Remembers if the summary edit box is open
	const [editSermonOpen, setEditSermonOpen] = useState(false); //	Remembers if the Edit popup is open
	const [deleteSermonOpen, setDeleteSermonOpen] = useState(false); // Remembers if the Delete popup is open
	const [isRegenerating, setIsRegenerating] = useState(false); // Stops a second click from queueing the same summary job twice

	const playerRef = useRef<YouTubePlayer | null>(null); //creates reference for youtube player
	const [playerReady, setPlayerReady] = useState(false); //remembers if the player is ready (video is loaded)
	const [pendingSeek, setPendingSeek] = useState<number | null>(null); //remembers if the video is seeking a timestamp, setPendingSeek stores (seconds: number) to tell where to seek towards when video is loaded
	const [videoError, setVideoError] = useState<string | null>(null); //remembers if there is an error with loading the video

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

	// Resets the draft when switching sermons

	// Ask the server for a new AI summary, then reload the sermon so the card shows it.
	// With the job queue on, the new summary only appears once the worker finishes, so the toast says it may take a moment.
	const regenerateSummary = async () => {
		if (isRegenerating) return;
		setIsRegenerating(true);
		try {
			await axios.post(`/api/sermons/${id}/regenerate-summary`);
			showToast(
				'Regenerating summary with AI. It may take a moment to appear.',
				'info',
			);
			await query.refetch();
		} catch (error) {
			// The server sends a readable message for the cases people can act on, like the job queue being down.
			const message =
				(axios.isAxiosError(error) && error.response?.data?.error) ||
				'Could not regenerate the summary';
			showToast(message, 'error');
		} finally {
			setIsRegenerating(false);
		}
	};

	const saveSummary = async () => {
		if (!isAdmin || isSavingSummary) return;

		if (summaryDraft?.sermonId !== currentSermonID) {
			showToast('No summary draft to save.', 'error');
			return;
		}

		setIsSavingSummary(true);

		try {
			await axios.patch(`/api/sermons/${currentSermonID}/summary`, {
				summary: summaryDraft.text,
			});

			// Refresh the sermon data so the saved summary is displayed.
			await query.refetch();

			setSummaryDraft(null);
			setEditingSermonID(null);
			setIsEditingSummary(false);

			showToast('Summary saved successfully.', 'success');
		} catch (error) {
			const message =
				(axios.isAxiosError(error) && error.response?.data?.error) ||
				'Could not save summary';

			showToast(message, 'error');
		} finally {
			setIsSavingSummary(false);
		}
	};

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

	// Determine the current summary based on the draft or the sermon's original summary
	const currentSermonID = String(sermon.id);

	const currentSummary =
		summaryDraft?.sermonId === currentSermonID
			? summaryDraft.text
			: (sermon.summary ?? '');

	const isEditing = isEditingSummary && editingSermonID === currentSermonID;

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

	function getYouTubeEmbedUrl(videoLink: string): string | null {
		try {
			const url = new URL(videoLink);

			if (url.hostname === 'youtu.be') {
				return url.pathname.slice(1);
			} else if (
				url.hostname === 'www.youtube.com' ||
				url.hostname === 'youtube.com'
			) {
				return url.searchParams.get('v');
			}

			return null;
		} catch {
			return null;
		}
	}

	type YouTubePlayer = Parameters<
		NonNullable<YouTubeProps['onReady']>
	>[0]['target'];

	const handlePlayerReady: YouTubeProps['onReady'] = event => {
		//readies the player, also seeks to time if already requested to seek time before video start
		playerRef.current = event.target;
		setPlayerReady(true);

		if (pendingSeek !== null) {
			event.target.seekTo(pendingSeek, true);
			event.target.playVideo();
			setPendingSeek(null);
		}
	};

	function seekToTranscriptTime(seconds: number) {
		//skips player to specified time in video (in seconds), to be used with transcript to skip to specified segment
		if (playerReady && playerRef.current) {
			playerRef.current.seekTo(seconds, true);
			playerRef.current.playVideo();
		} else {
			setPendingSeek(seconds);
		}
	}

	const videoId = getYouTubeEmbedUrl(sermon.videoLink);

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
							<div className="SermonDetail-player">
								{!videoId ? (
									<p>Invalid YouTube video link</p>
								) : videoError ? (
									<p>{videoError}</p>
								) : (
									<YouTube
										videoId={videoId}
										className="SermonDetail-youtube"
										iframeClassName="SermonDetail-youtube-frame"
										title={sermon.title}
										onReady={handlePlayerReady}
										onError={() => {
											setVideoError(
												'This video could not be loaded. It may be unavailable or embedding may be disabled.',
											);
											console.log({ videoError });
										}}
										opts={{
											playerVars: {
												rel: 0,
											},
										}}
									/>
								)}
							</div>
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
									disabled={!isAdmin}
									onClick={() => setEditSermonOpen(true)}
								>
									Edit
								</Button>
								<Button
									variant="danger"
									disabled={!isAdmin}
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
								onClick={regenerateSummary}
								disabled={!isAdmin || isRegenerating}
							>
								{isRegenerating ? 'Regenerating...' : 'Regenerate with AI'}
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
						{isEditing ? (
							<div className="SermonDetail-summary-editing">
								<textarea
									className="SermonDetail-summary-textarea"
									value={currentSummary}
									disabled={!isAdmin}
									onChange={e => {
										setSummaryDraft({
											sermonId: currentSermonID,
											text: e.target.value,
										});
									}}
								/>

								<div className="SermonDetail-summary-actions">
									<Button
										type="button"
										variant="secondary"
										className="SermonDetail-summary-btn"
										onClick={() => {
											setSummaryDraft(null);
											setEditingSermonID(null);
											setIsEditingSummary(false);
										}}
									>
										Cancel
									</Button>

									<Button
										type="button"
										variant="secondary"
										className="SermonDetail-summary-btn"
										disabled={!isAdmin}
										onClick={() => {
											setSummaryDraft({
												sermonId: currentSermonID,
												text: sermon.summary ?? '',
											});
										}}
									>
										Reset
									</Button>
									<Button
										type="button"
										variant="primary"
										className="SermonDetail-summary-btn"
										disabled={!isAdmin || isSavingSummary}
										onClick={saveSummary}
									>
										{isSavingSummary ? 'Saving...' : 'Save'}
									</Button>
								</div>
							</div>
						) : (
							<Button
								type="button"
								variant="secondary"
								className="SermonDetail-summary-btn"
								disabled={!isAdmin}
								onClick={() => {
									setSummaryDraft({
										sermonId: currentSermonID,
										text: sermon.summary ?? '',
									});
									setEditingSermonID(currentSermonID);
									setIsEditingSummary(true);
								}}
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

						<span>
							<button type="button" onClick={() => seekToTranscriptTime(15)}>
								<p>
									Click to Skip Video to 0:15 (This is to test video seeking)
								</p>
							</button>
						</span>
						<span></span>

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
