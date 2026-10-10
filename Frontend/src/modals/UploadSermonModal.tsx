// Import one sermon from a YouTube link and show what the import filled in.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import clsx from 'clsx';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './UploadSermonModal.css';
import Button from '$/components/Button';
import { FormField, FormRow } from '$/components/FormField';
import Modal from '$/components/Modal';
import { useToast } from '$/components/ToastContext';
import { invalidateSermonData } from '$/hooks/useImportSermons';
import { apiErrorMessage } from '$/lib/api';
import { normalizeYouTubeUrl, youtubeLinkError } from '$/lib/youtube';
import { linkTo, Sermon } from '$/types/sermon';
import { getFullName } from '$/types/speaker';

interface UploadSermonModalProps {
	isOpen: boolean;
	onClose: () => void;
}

const BLANK = { title: '', speaker: '', series: '', date: '', description: '' };
type Details = typeof BLANK;

const SPEAKERS = ['Dave Patterson', 'Guest Speaker'];
const SERIES = ['Live Your Best Life', 'Hope Rising', 'Together', 'Fearless'];

// An imported speaker or series is usually not one of the listed names, so add it for the select to show.
function withSelected(names: string[], selected: string): string[] {
	return !selected || names.includes(selected) ? names : [...names, selected];
}

/** Validate a pasted YouTube link, send it to the import endpoint and fill the form from the imported sermon. */
export default function UploadSermonModal({
	isOpen,
	onClose,
}: UploadSermonModalProps) {
	const { showToast } = useToast();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	// Some pages mount this modal twice (header and floating button), so the form id cannot be fixed.
	const formId = useId();
	const [url, setUrl] = useState('');
	const [error, setError] = useState('');
	const [details, setDetails] = useState<Details>(BLANK);
	const [imported, setImported] = useState<Sermon | null>(null);
	// Closing does not cancel a running import, so its callbacks read this to know if the modal is still showing.
	const openRef = useRef(isOpen);
	useEffect(() => {
		openRef.current = isOpen;
	}, [isOpen]);

	// TODO: there is no update endpoint for sermons yet (e.g. PATCH /api/sermons/<id>), so edits made after
	// an import could not be saved. Until it exists the fields are locked once the import has filled them in.
	const locked = imported !== null;
	// The import endpoint only takes the link, so anything typed before importing is not sent
	// and is replaced here by the details from the video.
	const shown: Details = imported
		? {
				title: imported.title,
				speaker: getFullName(imported.speaker),
				series: imported.series?.title ?? '',
				date: imported.date.toISOString().slice(0, 10),
				description: imported.description,
			}
		: details;

	const importVideo = useMutation({
		mutationFn: async (link: string) => {
			const response = await axios.post('/api/import/youtube/video', {
				url: link,
			});
			// 201 is a new sermon; 200 means this video was imported before.
			return {
				sermon: Sermon.parse(response.data),
				created: response.status === 201,
			};
		},
		onSuccess: ({ sermon, created }) => {
			if (!created) {
				showToast(`"${sermon.title}" was already imported.`, 'info');
			} else if (sermon.status === 'Failed') {
				showToast(
					`Imported "${sermon.title}", but processing failed: ${sermon.processingError ?? 'unknown error'}`,
					'error',
				);
			} else {
				showToast(
					sermon.status === 'Processing'
						? `Imported "${sermon.title}". Processing started.`
						: `Imported "${sermon.title}".`,
					'success',
				);
			}

			invalidateSermonData(queryClient);
			if (openRef.current) setImported(sermon);
		},
		onError: failure => {
			const message =
				axios.isAxiosError(failure) && failure.response?.status === 403
					? 'Only admins can import sermons.'
					: apiErrorMessage(failure, 'Could not import the video. Try again.');
			if (openRef.current) {
				setError(message);
			} else {
				showToast(message, 'error');
			}
		},
	});

	function edit(field: keyof Details, value: string) {
		setDetails(previous => ({ ...previous, [field]: value }));
	}

	function handleClose() {
		setUrl('');
		setError('');
		setDetails(BLANK);
		setImported(null);
		onClose();
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		// Enter in the field submits too, so a disabled button alone does not stop a second request.
		if (importVideo.isPending || locked) return;

		const message = youtubeLinkError(url);
		if (message) {
			setError(message);
			return;
		}
		importVideo.mutate(normalizeYouTubeUrl(url));
	}

	return (
		<Modal
			isOpen={isOpen}
			onClose={handleClose}
			title="Upload Sermon"
			size="lg"
			footer={
				imported ? (
					<>
						<Button variant="secondary" onClick={handleClose}>
							Close
						</Button>
						<Button
							variant="primary"
							onClick={() => {
								handleClose();
								navigate(linkTo(imported));
							}}
						>
							Open sermon
						</Button>
					</>
				) : (
					<>
						<Button variant="secondary" onClick={handleClose}>
							Cancel
						</Button>
						<Button
							variant="primary"
							type="submit"
							form={formId}
							disabled={importVideo.isPending}
							aria-busy={importVideo.isPending}
						>
							{importVideo.isPending ? 'Importing…' : 'Import & Process'}
						</Button>
					</>
				)
			}
		>
			{/* noValidate: the browser's own URL check would block links pasted without https:// before ours runs. */}
			<form id={formId} onSubmit={handleSubmit} noValidate>
				<FormField
					label="Paste a YouTube link"
					hint="Accepts youtube.com/watch?v=…, youtu.be/… and youtube.com/shorts/… links."
					error={error}
				>
					<input
						type="url"
						aria-label="YouTube link"
						aria-invalid={!!error}
						placeholder="https://www.youtube.com/watch?v=..."
						value={url}
						disabled={importVideo.isPending || locked}
						onChange={e => {
							setUrl(e.target.value);
							if (error) setError('');
						}}
					/>
				</FormField>
			</form>

			<hr
				style={{
					border: 'none',
					borderTop: '1px solid var(--cl-outline)',
					margin: '20px 0',
				}}
			/>

			<div
				className={clsx(
					'UploadModal-details',
					locked && 'UploadModal-details--locked',
				)}
			>
				<FormRow>
					<FormField label="Sermon Title">
						<input
							type="text"
							placeholder="Enter sermon title"
							value={shown.title}
							readOnly={locked}
							onChange={e => edit('title', e.target.value)}
						/>
					</FormField>
					<FormField label="Speaker">
						<select
							value={shown.speaker}
							disabled={locked}
							onChange={e => edit('speaker', e.target.value)}
						>
							<option value="">Select speaker</option>
							{withSelected(SPEAKERS, shown.speaker).map(name => (
								<option key={name}>{name}</option>
							))}
						</select>
					</FormField>
				</FormRow>

				<FormRow>
					<FormField label="Series">
						<select
							value={shown.series}
							disabled={locked}
							onChange={e => edit('series', e.target.value)}
						>
							<option value="">{locked ? 'No series' : 'Select series'}</option>
							{withSelected(SERIES, shown.series).map(title => (
								<option key={title}>{title}</option>
							))}
						</select>
					</FormField>
					<FormField label="Date">
						<input
							type="date"
							value={shown.date}
							readOnly={locked}
							onChange={e => edit('date', e.target.value)}
						/>
					</FormField>
				</FormRow>

				<FormField label="Description">
					<textarea
						placeholder="Enter a short description"
						value={shown.description}
						readOnly={locked}
						onChange={e => edit('description', e.target.value)}
					/>
				</FormField>
			</div>

			<div className="UploadModal-checkboxes">
				<label className="UploadModal-checkbox">
					<input type="checkbox" defaultChecked />
					Auto-generate transcript via AI
				</label>
				<label className="UploadModal-checkbox">
					<input type="checkbox" defaultChecked />
					Auto-generate summary and tags via AI
				</label>
			</div>
		</Modal>
	);
}
