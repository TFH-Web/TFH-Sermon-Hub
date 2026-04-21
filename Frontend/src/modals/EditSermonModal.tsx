import { useEffect, useRef, useState } from 'react';
import './EditSermonModal.css';
import Button from '$/components/Button';
import { FormField, FormRow } from '$/components/FormField';
import Modal from '$/components/Modal';
import { useToast } from '$/components/ToastContext';
import type { Sermon } from '../types/sermon';

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

	useEffect(() => {
		if (sermon) {
			setTitle(sermon.title);
			setSpeaker(sermon.speaker);
			setSeries(sermon.series);
			setTags(sermon.tags.join(', '));
			setSeriesIndex('');
			setDate('');
			setVideoLink('');
			setNotes('');
			setTranscript('');
			setTitleError('');
			setSpeakerError('');
		}
	}, [sermon]);

	const handleSave = () => {
		let valid = true;
		if (!title.trim()) {
			setTitleError('Sermon title is required');
			valid = false;
		}
		if (!speaker) {
			setSpeakerError('Speaker is required');
			valid = false;
		}
		if (!valid) {
			showToast('Please fill in all required fields', 'error');
			return;
		}
		onClose();
		showToast('Sermon updated', 'success');
	};

	// For transcript file upload - hidden file input triggered by "Upload Transcript" button
	const fileInputRef = useRef<HTMLInputElement>(null);
	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			// Read the file and populate the transcript text area
			const reader = new FileReader();
			reader.onload = (event) => {
				setTranscript(event.target?.result as string);
			};
			reader.readAsText(file);
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
						Save Changes
					</Button>
				</>
			}
		>
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
				{/* Hidden file input */}
				<input
					ref={fileInputRef}
					type="file"
					accept=".txt"
					onChange={handleFileSelect}
					style={{ display: 'none' }}
				/>

				{/* Upload button */}
                <span>
                    <Button
					variant = "secondary"
					onClick={() => fileInputRef.current?.click()}
                    className='upload-button'
				>
					Upload Transcript File
				    </Button>
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