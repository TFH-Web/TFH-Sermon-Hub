// Show saved captions in the sermon page and retry the real processing pipeline.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useState } from 'react';
import { Sermon } from '$/types/sermon';
import { Transcript } from '$/types/transcript';
import { useUser } from '$/types/user';
import Button from './Button';
import { Card } from './Card';
import Tag from './Tag';
import { useToast } from './ToastContext';

function timestamp(seconds: number): string {
	const whole = Math.floor(seconds);
	const minutes = Math.floor(whole / 60);
	return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

function videoAt(link: string, seconds: number): string {
	const url = new URL(link);
	url.searchParams.set('t', String(Math.floor(seconds)));
	return url.href;
}

function keyed<T>(values: T[], identify: (value: T) => string) {
	const seen = new Map<string, number>();
	return values.map(value => {
		const identity = identify(value);
		const occurrence = seen.get(identity) ?? 0;
		seen.set(identity, occurrence + 1);
		return { value, key: `${identity}:${occurrence}` };
	});
}

/** Render the saved transcript, source timestamps, and the Admin caption refresh action. */
export default function SermonTranscript({ sermon }: { sermon: Sermon }) {
	const { showToast } = useToast();
	const user = useUser();
	const queryClient = useQueryClient();
	const [timed, setTimed] = useState(false);
	const key = ['sermon-transcript', sermon.id];
	const query = useQuery({
		queryKey: [...key, sermon.status, sermon.processedAt ?? null],
		queryFn: async () => {
			const response = await axios.get(`/api/sermons/${sermon.id}/transcript`);
			return Transcript.parse(response.data);
		},
		refetchInterval: sermon.status === 'Processing' ? 2000 : false,
	});
	const refresh = useMutation({
		mutationFn: async () => {
			const response = await axios.post(`/api/sermons/${sermon.id}/reprocess`);
			return Sermon.parse(response.data);
		},
		onMutate: () => {
			queryClient.setQueryData(['sermon', String(sermon.id)], {
				...sermon,
				status: 'Processing',
				processingError: null,
			});
		},
		onSuccess: async updated => {
			queryClient.setQueryData(['sermon', String(sermon.id)], updated);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: key }),
				queryClient.invalidateQueries({ queryKey: ['sermons'] }),
			]);
			if (updated.status === 'Failed') {
				showToast(
					'Caption processing failed. See the processing error below.',
					'error',
				);
			} else {
				showToast(
					updated.status === 'Processing'
						? 'Caption processing started.'
						: 'Captions refreshed.',
					'success',
				);
			}
		},
		onError: async () => {
			await queryClient.invalidateQueries({
				queryKey: ['sermon', String(sermon.id)],
			});
			showToast('Could not start caption processing. Try again.', 'error');
		},
	});
	const text = query.data ? query.data.transcript : sermon.transcript;
	const segments = query.data?.segments ?? [];
	const processing = refresh.isPending || sermon.status === 'Processing';
	const cues = keyed(segments, segment =>
		[segment.start, segment.end, segment.text].join(':'),
	);
	const paragraphs = keyed(
		(text ?? '').split(/\n\s*\n/).filter(paragraph => paragraph.trim()),
		paragraph => paragraph,
	);

	async function copyText() {
		try {
			await navigator.clipboard.writeText(text ?? '');
			showToast('Transcript copied.', 'success');
		} catch {
			showToast(
				'Could not copy the transcript. Select the text to copy it.',
				'error',
			);
		}
	}

	return (
		<Card className="SermonDetail-transcript">
			<div className="SermonDetail-card-header">
				<h2 className="SermonDetail-card-title">Transcript</h2>
				<div className="SermonDetail-card-actions">
					<Button variant="ghost" disabled={!text} onClick={copyText}>
						Copy
					</Button>
				</div>
			</div>
			<div className="SermonDetail-transcript-tools">
				<div className="SermonDetail-transcript-source">
					<Tag variant="blue">
						{segments.length ? 'YouTube captions' : 'Transcript'}
					</Tag>
					{segments.length > 0 && (
						<span>{segments.length.toLocaleString()} segments</span>
					)}
				</div>
				<div className="SermonDetail-transcript-controls">
					{segments.length > 0 && (
						<>
							<Button
								variant="ghost"
								aria-pressed={!timed}
								onClick={() => setTimed(false)}
							>
								Full text
							</Button>
							<Button
								variant="ghost"
								aria-pressed={timed}
								onClick={() => setTimed(true)}
							>
								Timestamps
							</Button>
						</>
					)}
					{user.role === 'Admin' && (
						<Button
							variant="secondary"
							disabled={processing}
							aria-busy={processing}
							onClick={() => refresh.mutate()}
						>
							{processing
								? 'Fetching captions…'
								: text
									? 'Refresh captions'
									: 'Fetch captions'}
						</Button>
					)}
				</div>
			</div>
			{sermon.processingError && (
				<p className="SermonDetail-transcript-error" role="alert">
					{sermon.processingError}
				</p>
			)}
			{query.isError && (
				<div className="SermonDetail-transcript-notice" role="status">
					Could not load saved caption times.
					<Button variant="ghost" onClick={() => query.refetch()}>
						Retry
					</Button>
				</div>
			)}
			<section
				className="SermonDetail-transcript-container"
				aria-label="Sermon transcript"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll this transcript region.
				tabIndex={0}
			>
				{timed && segments.length > 0 ? (
					cues.map(({ value: segment, key }) => (
						<div className="SermonDetail-transcript-cue" key={key}>
							<a
								href={videoAt(sermon.videoLink, segment.start)}
								target="_blank"
								rel="noreferrer"
								aria-label={`Watch from ${timestamp(segment.start)}`}
							>
								{timestamp(segment.start)}
							</a>
							<p>{segment.text}</p>
						</div>
					))
				) : text ? (
					paragraphs.map(({ value: paragraph, key }) => (
						<p className="SermonDetail-transcript-paragraph" key={key}>
							{paragraph}
						</p>
					))
				) : (
					<p className="SermonDetail-transcript-paragraph" role="status">
						{processing ? 'Fetching YouTube captions…' : 'No transcript yet.'}
					</p>
				)}
			</section>
		</Card>
	);
}
