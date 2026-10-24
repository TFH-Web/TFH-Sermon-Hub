import { useQuery } from '@tanstack/react-query'; // tool to ask the server for data or if its broken or still waiting
import axios from 'axios'; // Sends the HTTP request to the backend
import { useRef, useState } from 'react'; // Allows the page remember things that changed like if something was enabled or disabled

import './SermonDetail.css';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { YouTubeProps } from 'react-youtube';
import YouTube from 'react-youtube';
import Button from '$/components/Button';
import { Card } from '$/components/Card.tsx';
import ErrorBox from '$/components/ErrorBox.tsx';
import Loading from '$/components/Loading.tsx';
import MainLayout from '$/components/MainLayout';
import SermonSummaryOrigin from '$/components/SermonSummaryOrigin';
import SermonTag from '$/components/SermonTag';
import SermonTranscript from '$/components/SermonTranscript';
import Tag from '$/components/Tag.tsx';
import { useToast } from '$/components/ToastContext.tsx';
import { formatCalendarDate } from '$/lib/date';
import { parseSourceTimestamp } from '$/lib/sourceTimestamp';
import { buildYouTubeWatchUrl, resolveYouTubeVideoId } from '$/lib/youtube';
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
	const { id } = useParams();
	const [searchParams] = useSearchParams();
	const sourceTimestamp = parseSourceTimestamp(searchParams.get('t'));

	// Start fresh when the selected sermon or source timestamp changes.
	return (
		<SermonDetailContent
			key={`${id}:${sourceTimestamp ?? 'start'}`}
			sourceTimestamp={sourceTimestamp}
		/>
	);
}

function SermonDetailContent({
	sourceTimestamp,
}: {
	sourceTimestamp: number | null;
}) {
	const { showToast } = useToast(); // let's up pop up a little message at the corner of the screen

	const { id } = useParams(); // reads the number of the web address, so /sermons/5 gives us 5
	const [isEditingSummary, setIsEditingSummary] = useState(false); // Remembers if the summary edit box is open
	const [editSermonOpen, setEditSermonOpen] = useState(false); //	Remembers if the Edit popup is open
	const [deleteSermonOpen, setDeleteSermonOpen] = useState(false); // Remembers if the Delete popup is open
	const [isRegenerating, setIsRegenerating] = useState(false); // Stops a second click from queueing the same summary job twice

	const playerRef = useRef<YouTubePlayer | null>(null); //creates reference for youtube player
	const [playerReady, setPlayerReady] = useState(false); //remembers if the player is ready (video is loaded)
	// Remember the latest timestamp so a recreated player can restore it.
	const pendingSeekRef = useRef<number | null>(sourceTimestamp);
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

	const updateSummary = async (formData: FormData) => {
		if (isRegenerating) return;
		setIsRegenerating(true);
		try {
			await axios.patch(`/api/sermons/${id}`, Object.fromEntries(formData.entries()));
			showToast(
				'Updating summary. It may take a moment to appear.',
				'info',
			);
			await query.refetch();
		} catch (error) {
			// The server sends a readable message for the cases people can act on, like the job queue being down.
			const message =
				(axios.isAxiosError(error) && error.response?.data?.error) ||
				'Could not update the summary';
			showToast(message, 'error');
		} finally {
			setIsRegenerating(false);
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

	// The server sends one long block of text. Cut it into separate paragraphs so the page can show them one under the other.
	// If the sermon has no summary saved, we end up with nothing to show.
	const summaryParagraphs = sermon.summary ? toParagraphs(sermon.summary) : [];

	// Count AI and manual tags separately instead of labeling every tag as AI.
	const aiTagCount = sermon.tags.filter(tag => tag.source === 'ai').length;
	const manualTagCount = sermon.tags.filter(
		tag => tag.source === 'manual',
	).length;

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

	type YouTubePlayer = Parameters<
		NonNullable<YouTubeProps['onReady']>
	>[0]['target'];

	const handlePlayerReady: YouTubeProps['onReady'] = event => {
		playerRef.current = event.target;
		setPlayerReady(true);

		// Restore the requested timestamp whenever the player is recreated.
		const seconds = pendingSeekRef.current;

		if (seconds === null) {
			return;
		}

		try {
			event.target.seekTo(seconds, true);
			event.target.playVideo();
		} catch {
			// Keep external video links available if seeking fails.
			playerRef.current = null;
			setPlayerReady(false);
			setVideoError('The video could not seek to the selected timestamp.');
		}
	};

	function seekToTranscriptTime(seconds: number): boolean {
		// Use the external link if the embedded video cannot handle the request.
		if (!Number.isFinite(seconds) || seconds < 0 || !videoId || videoError) {
			return false;
		}

		// Keep the latest requested timestamp if the player is recreated.
		pendingSeekRef.current = seconds;

		// Wait for the ready callback if the player is still loading.
		if (!playerReady || !playerRef.current) {
			return true;
		}

		try {
			// Move the video to the selected cue and start playback.
			playerRef.current.seekTo(seconds, true);
			playerRef.current.playVideo();
			return true;
		} catch {
			// Allow the timestamp's external link if the player fails.
			return false;
		}
	}

	// Validate the saved link and ID before displaying a video or link.
	const videoId = resolveYouTubeVideoId(sermon);
	const watchUrl = videoId ? buildYouTubeWatchUrl(videoId) : null;

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
											// Stop waiting for a player that failed to load.
											playerRef.current = null;
											pendingSeekRef.current = null;
											setPlayerReady(false);
											setVideoError(
												'This video could not be loaded. It may be unavailable or embedding may be disabled.',
											);
										}}
										opts={{
											playerVars: {
												rel: 0,

												// Set the starting position when opening a source link.
												start:
													sourceTimestamp === null
														? undefined
														: Math.floor(sourceTimestamp),
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
								{formatCalendarDate(sermon.date)}
								{sermon.duration
									? ` • ${durationToString(sermon.duration)}`
									: ''}
							</p>
							<div className="SermonDetail-tags">
								{/* Show AI origin only for tags marked as AI by the API. */}
								{sermon.tags.map(tag => (
									<SermonTag key={tag.name} tag={tag} />
								))}
							</div>
							<div className="SermonDetail-btn-group">
								{watchUrl ? (
									<a
										className="Button Button--primary"
										href={watchUrl}
										target="_blank"
										rel="noreferrer"
									>
										Watch
									</a>
								) : (
									<span>Video unavailable</span>
								)}
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
				{/* Let transcript timestamps control this sermon's video. */}
				<SermonTranscript sermon={sermon} onSeek={seekToTranscriptTime} />

				{/* Summary Section */}
				<Card className="SermonDetail-summary">
					<div className="SermonDetail-card-header">
						<h2 className="SermonDetail-card-title">Summary</h2>
						<div className="SermonDetail-card-actions">
							{/* Keep the saved origin visible while viewing or editing. */}
							<SermonSummaryOrigin
								summary={sermon.summary}
								summarySource={sermon.summarySource}
							/>
							<Button
								variant="ghost"
								className="SermonDetail-regenerate-btn"
								onClick={regenerateSummary}
								disabled={isRegenerating}
							>
								{isRegenerating ? 'Regenerating...' : 'Regenerate with AI'}
							</Button>
						</div>
					</div>
					<div className="SermonDetail-summary-container">
						{isEditingSummary ? (
							<form
								id="SermonDetail-summary-form"
								method="post"
								onSubmit={async e => {
									e.preventDefault();

									setIsEditingSummary(false);

									const formData = new FormData(e.target);
									updateSummary(formData);
								}}
							>
								<textarea
									name="summary"
									rows={10}
									className="SermonDetail-summary-editing"
									defaultValue={summaryParagraphs.join('\n\n')}
								/>
							</form>
						) : summaryParagraphs.length > 0 ? (
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
						{/* Same idea as the transcript. Say there is no summary rather than showing an empty panel. */}
					</div>
					<div className="SermonDetail-summary-edit-container">
						{isEditingSummary ? (
							<div>
								<Button
									variant="primary"
									className="SermonDetail-summary-btn"
									type="submit"
									form="SermonDetail-summary-form"
								>
									Save
								</Button>
								<Button
									variant="secondary"
									className="SermonDetail-summary-btn"
									onClick={() => {
										setIsEditingSummary(false);
									}}
								>
									Cancel
								</Button>
							</div>
						) : (
							<Button
								variant="secondary"
								className="SermonDetail-summary-btn"
								onClick={() => {
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
							{formatCalendarDate(sermon.date, 'long')}
						</span>

						<span className="SermonDetail-metadata-label">Duration</span>
						<span className="SermonDetail-metadata-value">
							{durationToString(sermon.duration)}
						</span>

						<span className="SermonDetail-metadata-label">Video</span>
						{/* Show only a link built from a validated video ID. */}
						<span className="SermonDetail-metadata-value">
							{watchUrl ? (
								<a
									href={watchUrl}
									target="_blank"
									rel="noreferrer"
									className="SermonDetail-metadata-link"
								>
									{watchUrl.replace('https://', '')}
								</a>
							) : (
								'Video unavailable'
							)}
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
							{/* Summary existence does not tell us who created it. */}
							{sermon.summary ? (
								<Tag variant="green">Available</Tag>
							) : (
								<Tag variant="amber">Not available</Tag>
							)}
						</span>

						<span className="SermonDetail-metadata-label">Tags</span>
						<span className="SermonDetail-metadata-value">
							{aiTagCount > 0 && (
								<Tag variant="green">AI Generated ({aiTagCount})</Tag>
							)}
							{manualTagCount > 0 && (
								<Tag variant="outline">Manual ({manualTagCount})</Tag>
							)}
							{sermon.tags.length === 0 && <span>No tags</span>}
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
