import { useEffect, useState } from 'react';
import './EditSermonModal.css';
import { useMsal } from '@azure/msal-react';
import Button from '$/components/Button';
import FileUploadButton from '$/components/FileUploadButton';
import { FormField, FormRow } from '$/components/FormField';
import Modal from '$/components/Modal';
import SermonTag from '$/components/SermonTag';
import { useToast } from '$/components/ToastContext';
import type { Sermon } from '$/types/sermon';
import { getFullName } from '$/types/speaker';

interface EditSermonModalProps {
	isOpen: boolean;
	onClose: () => void;
	sermon: Sermon | null;
}

export default function EditSermonModal({
	isOpen,
	onClose,
	sermon,
}: EditSermonModalProps) {
	const { showToast } = useToast();
	const { instance, accounts } = useMsal();
	const [title, setTitle] = useState('');
	const [titleError, setTitleError] = useState('');
	const [speaker, setSpeaker] = useState('');
	const [speakerError, setSpeakerError] = useState('');
	const [series, setSeries] = useState('');
	const [seriesIndex, setSeriesIndex] = useState('');
	const [date, setDate] = useState('');
	const [videoLink, setVideoLink] = useState('');
	const [tags, setTags] = useState('');
	const [notes, setNotes] = useState('');
	const [transcript, setTranscript] = useState('');
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState('');

	useEffect(() => {
		if (sermon) {
			setTitle(sermon.title);
			setSpeaker(getFullName(sermon.speaker));
			setSeries(sermon.series?.title ?? '');
			setTags(sermon.tags.map(t => t.name).join(', '));
			setSeriesIndex('');
			setDate('');
			setVideoLink('');
			setNotes('');
			setTranscript('');
			setTitleError('');
			setSpeakerError('');
		}
	}, [sermon]);

	const handleSave = async () => {
		let valid = true;
		if (!title.trim()) {
			setTitleError('Sermon title is required');
			valid = false;
		}
		if (!speaker) {
			setSpeakerError('Speaker is required');
			valid = false;
		}
		if (!valid || !sermon || isSaving) {
			showToast('Please fill in all required fields', 'error');
			return;
		}
		setIsSaving(true);
		setSaveError('');

		// Authentication with Microsoft using MSAL to acquire an access token
		try {
			const account = accounts[0];
			if (!account) {
				throw new Error('Sign in with Microsoft again');
			}

			const response = await instance.acquireTokenSilent({
				account,
				scopes: ['openid', 'profile'],
			});

			const payload = {
				title: title.trim(),
				tags: tags
					.split(',')
					.map(t => t.trim())
					.filter(Boolean)
					.map(name => ({ name })),
			};
			const result = await fetch(`/api/sermons/${sermon.id}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					...(response?.accessToken
						? { Authorization: `Bearer ${response.accessToken}` }
						: {}),
				},
				body: JSON.stringify(payload),
			});
			if (!result.ok)
				throw new Error(`Failed to update sermon (${result.status})`);

			onClose();
			showToast('Sermon updated successfully', 'success');
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : 'Failed to update sermon';
			setSaveError(message);
			showToast(message, 'error');
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="Edit Sermon"
			size="lg"
			footer={
				<>
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" onClick={handleSave}>
						{isSaving ? 'Saving...' : 'Save Changes'}
					</Button>
				</>
			}
		>
			{saveError && (
				<p role="alert" className="EditSermonModal">
					{saveError}
				</p>
			)}
			<FormRow>
				<FormField label="Sermon Title *" error={titleError}>
					<input
						type="text"
						placeholder="Enter sermon title"
						value={title}
						onChange={e => {
							setTitle(e.target.value);
							if (titleError) setTitleError('');
						}}
					/>
				</FormField>
				<FormField label="Speaker *" error={speakerError}>
					<select
						value={speaker}
						onChange={e => {
							setSpeaker(e.target.value);
							if (speakerError) setSpeakerError('');
						}}
					>
						<option value="">Select speaker</option>
						<option value="Dave Patterson">Dave Patterson</option>
						<option value="Guest Speaker">Guest Speaker</option>
					</select>
				</FormField>
			</FormRow>

			<FormRow>
				<FormField label="Series">
					<select value={series} onChange={e => setSeries(e.target.value)}>
						<option value="">Select series</option>
						<option value="Live Your Best Life">Live Your Best Life</option>
						<option value="Hope Rising">Hope Rising</option>
						<option value="Together">Together</option>
						<option value="Fearless">Fearless</option>
					</select>
				</FormField>
				<FormField label="Series Index">
					<input
						type="number"
						placeholder="e.g. 4"
						value={seriesIndex}
						onChange={e => setSeriesIndex(e.target.value)}
					/>
				</FormField>
			</FormRow>

			<FormRow>
				<FormField label="Date">
					<input
						type="date"
						value={date}
						onChange={e => setDate(e.target.value)}
					/>
				</FormField>
				<FormField label="Video Link">
					<input
						type="text"
						placeholder="https://youtube.com/watch?v=..."
						value={videoLink}
						onChange={e => setVideoLink(e.target.value)}
					/>
				</FormField>
			</FormRow>

			<FormField label="Tags (comma-separated)">
				<input
					type="text"
					placeholder="grace, faith, hope"
					value={tags}
					onChange={e => setTags(e.target.value)}
				/>
			</FormField>

			{/* Show the origin of saved tags without guessing about unsaved edits. */}
			{sermon && sermon.tags.length > 0 && (
				<section aria-label="Saved tag origins">
					<p>Saved tags</p>
					{sermon.tags.map(tag => (
						<SermonTag key={tag.name} tag={tag} />
					))}
				</section>
			)}

			<FormField label="Sermon Notes">
				<textarea
					placeholder="Sermon outline and supplemental notes go here..."
					value={notes}
					onChange={e => setNotes(e.target.value)}
				/>
			</FormField>

			<hr
				style={{
					border: 'none',
					borderTop: '1px solid var(--cl-outline)',
					margin: '20px 0',
				}}
			/>

			<FormField label="Transcript">
				{/* Upload button */}
				<span>
					<FileUploadButton
						onFileRead={setTranscript}
						className="upload-button"
					>
						Upload Transcript File
					</FileUploadButton>
				</span>
				<span className="or-text">or paste below</span>

				{/* Textarea for pasting or displaying uploaded content */}
				<textarea
					placeholder="Paste transcript text here..."
					value={transcript}
					onChange={e => setTranscript(e.target.value)}
				/>
			</FormField>
		</Modal>
	);
}
