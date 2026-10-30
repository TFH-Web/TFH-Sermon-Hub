import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import './EditSermonModal.css';
import axios from 'axios';
import Button from '$/components/Button';
import FileUploadButton from '$/components/FileUploadButton';
import { FormField, FormRow } from '$/components/FormField';
import Modal from '$/components/Modal';
import SermonTag from '$/components/SermonTag';
import { useToast } from '$/components/ToastContext';
import { invalidateSermonData } from '$/hooks/useImportSermons';
import { apiErrorMessage } from '$/lib/api';
import { toCalendarDateString } from '$/lib/date';
import type { Series } from '$/types/series';
import type { Sermon } from '$/types/sermon';
import { getFullName, type Speaker } from '$/types/speaker';

interface EditSermonModalProps {
	isOpen: boolean;
	onClose: () => void;
	sermon: Sermon | null;
	// The speakers and series to choose from. The page loads them and passes them in, so this modal makes no requests
	// of its own besides the save. The sermon's own speaker and series are added when they are missing from these.
	speakers?: Speaker[];
	series?: Series[];
}

// The lists load on their own, so the sermon's current speaker or series can be missing from them for a moment, or for
// good (the series list stops at 100). Adding it keeps the select showing it, and keeps a save from clearing it.
function withCurrent<T extends { id: number }>(
	items: T[],
	current: T | null | undefined,
): T[] {
	return !current || items.some(item => item.id === current.id)
		? items
		: [...items, current];
}

export default function EditSermonModal({
	isOpen,
	onClose,
	sermon,
	speakers = [],
	series = [],
}: EditSermonModalProps) {
	const { showToast } = useToast();
	const queryClient = useQueryClient();
	const [title, setTitle] = useState('');
	const [titleError, setTitleError] = useState('');
	// The selects hold ids as text. A speaker is required; an empty series means the sermon has none.
	const [speakerId, setSpeakerId] = useState('');
	const [speakerError, setSpeakerError] = useState('');
	const [seriesId, setSeriesId] = useState('');
	const [seriesIndex, setSeriesIndex] = useState('');
	const [date, setDate] = useState('');
	const [description, setDescription] = useState('');
	const [descriptionError, setDescriptionError] = useState('');
	const [videoLink, setVideoLink] = useState('');
	const [tags, setTags] = useState('');
	const [notes, setNotes] = useState('');
	const [transcript, setTranscript] = useState('');
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState('');

	useEffect(() => {
		if (sermon) {
			setTitle(sermon.title);
			setSpeakerId(String(sermon.speaker.id));
			setSeriesId(sermon.series ? String(sermon.series.id) : '');
			setTags(sermon.tags.map(t => t.name).join(', '));
			setSeriesIndex('');
			// Shows the saved day.
			setDate(toCalendarDateString(sermon.date));
			setDescription(sermon.description);
			setVideoLink('');
			setNotes('');
			setTranscript('');
			setTitleError('');
			setSpeakerError('');
			setDescriptionError('');
		}
	}, [sermon]);

	const handleSave = async () => {
		let valid = true;
		if (!title.trim()) {
			setTitleError('Sermon title is required');
			valid = false;
		}
		if (!speakerId) {
			setSpeakerError('Speaker is required');
			valid = false;
		}
		// Every sermon has a description: the server refuses a blank one, and the sermon pages could not read one.
		if (!description.trim()) {
			setDescriptionError('Description is required');
			valid = false;
		}
		if (!valid || !sermon || isSaving) {
			showToast('Please fill in all required fields', 'error');
			return;
		}
		setIsSaving(true);
		setSaveError('');

		try {
			// Series Index, Video Link, Sermon Notes and Transcript are on the form but not part of the save, so they are not sent.
			const payload = {
				title: title.trim(),
				speaker: { id: Number(speakerId) },
				series: seriesId ? { id: Number(seriesId) } : null,
				// A date that was cleared is left out, so the saved date stays.
				...(date ? { date } : {}),
				description: description.trim(),
				tags: tags
					.split(',')
					.map(t => t.trim())
					.filter(Boolean)
					.map(name => ({ name })),
			};
			await axios.patch(`/api/sermons/${sermon.id}`, payload);
			await invalidateSermonData(queryClient);

			onClose();
			showToast('Sermon updated successfully', 'success');
		} catch (error: unknown) {
			const message = apiErrorMessage(
				error,
				'Failed to update sermon. Please try again.',
			);
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
					<Button variant="primary" onClick={handleSave} disabled={isSaving}>
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
						aria-label="Speaker"
						value={speakerId}
						onChange={e => {
							setSpeakerId(e.target.value);
							if (speakerError) setSpeakerError('');
						}}
					>
						<option value="">Select speaker</option>
						{withCurrent(speakers, sermon?.speaker).map(option => (
							<option key={option.id} value={option.id}>
								{getFullName(option)}
							</option>
						))}
					</select>
				</FormField>
			</FormRow>

			<FormRow>
				<FormField label="Series">
					<select
						aria-label="Series"
						value={seriesId}
						onChange={e => setSeriesId(e.target.value)}
					>
						<option value="">Select series</option>
						{withCurrent(series, sermon?.series).map(option => (
							<option key={option.id} value={option.id}>
								{option.title}
							</option>
						))}
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
						aria-label="Date"
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

			<FormField label="Description *" error={descriptionError}>
				<textarea
					aria-label="Description"
					placeholder="Enter a short description"
					value={description}
					onChange={e => {
						setDescription(e.target.value);
						if (descriptionError) setDescriptionError('');
					}}
				/>
			</FormField>

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
