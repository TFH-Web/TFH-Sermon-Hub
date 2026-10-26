// Import one sermon from a YouTube link and show what was imported.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './UploadSermonModal.css';
import Button from '$/components/Button';
import { FormField, FormRow } from '$/components/FormField';
import Modal from '$/components/Modal';
import { useToast } from '$/components/ToastContext';
import { invalidateSermonData } from '$/hooks/useImportSermons';
import { apiErrorMessage } from '$/lib/api';
import { toCalendarDateString } from '$/lib/date';
import { normalizeYouTubeUrl, youtubeLinkError } from '$/lib/youtube';
import { linkTo, Sermon } from '$/types/sermon';
import { getFullName } from '$/types/speaker';

interface UploadSermonModalProps {
	isOpen: boolean;
	onClose: () => void;
}

/** Validate a pasted YouTube link, send it to the import endpoint and show the imported sermon as a read-only preview. */
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
	const [imported, setImported] = useState<Sermon | null>(null);
	// Closing does not cancel a running import. This counts how many times the dialog has been closed, and each
	// import remembers the count it started at, so one that ends after a close does not fill in a dialog opened since.
	const closedCount = useRef(0);
	useEffect(() => {
		if (!isOpen) closedCount.current += 1;
	}, [isOpen]);

	const importVideo = useMutation({
		mutationFn: async ({ link }: { link: string; closedAt: number }) => {
			// The import endpoint only takes the link.
			const response = await axios.post('/api/import/youtube/video', {
				url: link,
			});
			// 201 is a new sermon; 200 means this video was imported before.
			return {
				sermon: Sermon.parse(response.data),
				created: response.status === 201,
			};
		},
		onSuccess: ({ sermon, created }, { closedAt }) => {
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
			if (closedAt === closedCount.current) setImported(sermon);
		},
		onError: (failure, { closedAt }) => {
			const message =
				axios.isAxiosError(failure) && failure.response?.status === 403
					? 'Only admins can import sermons.'
					: apiErrorMessage(failure, 'Could not import the video. Try again.');
			if (closedAt === closedCount.current) {
				setError(message);
			} else {
				showToast(message, 'error');
			}
		},
	});

	function handleClose() {
		setUrl('');
		setError('');
		setImported(null);
		// The import carries on, but a reopened dialog should not show it as still running.
		importVideo.reset();
		onClose();
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		// Enter in the field submits too, so a disabled button alone does not stop a second request.
		if (importVideo.isPending || imported) return;

		const message = youtubeLinkError(url);
		if (message) {
			setError(message);
			return;
		}
		importVideo.mutate({
			link: normalizeYouTubeUrl(url),
			closedAt: closedCount.current,
		});
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
						disabled={importVideo.isPending || imported !== null}
						onChange={e => {
							setUrl(e.target.value);
							if (error) setError('');
						}}
					/>
				</FormField>
			</form>

			{/* What the import filled in, for the admin to check. Changes are made on the sermon's own page. */}
			{imported && (
				<>
					<hr
						style={{
							border: 'none',
							borderTop: '1px solid var(--cl-outline)',
							margin: '20px 0',
						}}
					/>

					<div className="UploadModal-preview">
						<FormRow>
							<FormField label="Sermon Title">
								<input
									type="text"
									aria-label="Sermon title"
									value={imported.title}
									readOnly
								/>
							</FormField>
							<FormField label="Speaker">
								<input
									type="text"
									aria-label="Speaker"
									value={getFullName(imported.speaker)}
									readOnly
								/>
							</FormField>
						</FormRow>

						<FormRow>
							<FormField label="Series">
								<input
									type="text"
									aria-label="Series"
									value={imported.series?.title ?? 'No series'}
									readOnly
								/>
							</FormField>
							<FormField label="Date">
								{/* Preserve the saved calendar day in every time zone. */}
								<input
									type="date"
									aria-label="Date"
									value={toCalendarDateString(imported.date)}
									readOnly
								/>
							</FormField>
						</FormRow>

						<FormField label="Description">
							<textarea
								aria-label="Description"
								value={imported.description}
								readOnly
							/>
						</FormField>
					</div>
				</>
			)}
		</Modal>
	);
}
