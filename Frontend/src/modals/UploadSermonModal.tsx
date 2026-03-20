import { useState } from 'react';
import './UploadSermonModal.css';
import Button from '$/components/Button';
import { FormField, FormRow } from '$/components/FormField';
import Modal from '$/components/Modal';
import { useToast } from '$/components/ToastContext';
import UploadZone from '$/components/UploadZone';

interface UploadSermonModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function UploadSermonModal({
	isOpen,
	onClose,
}: UploadSermonModalProps) {
	const { showToast } = useToast();
	const [title, setTitle] = useState('');
	const [titleError, setTitleError] = useState('');

	const handleUpload = () => {
		if (!title.trim()) {
			setTitleError('Sermon title is required');
			showToast('Please fill in all required fields', 'error');
			return;
		}
		setTitleError('');
		onClose();
		showToast('Sermon uploaded — AI processing started', 'success');
		setTitle('');
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="Upload Sermon"
			size="lg"
			footer={
				<>
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" onClick={handleUpload}>
						Upload & Process
					</Button>
				</>
			}
		>
			<UploadZone />

			<FormField label="Or paste a video link">
				<input
					type="text"
					placeholder="https://youtube.com/watch?v=... or https://vimeo.com/..."
				/>
			</FormField>

			<hr
				style={{
					border: 'none',
					borderTop: '1px solid var(--cl-outline)',
					margin: '20px 0',
				}}
			/>

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
				<FormField label="Speaker *">
					<select>
						<option value="">Select speaker</option>
						<option>Dave Patterson</option>
						<option>Guest Speaker</option>
					</select>
				</FormField>
			</FormRow>

			<FormRow>
				<FormField label="Series">
					<select>
						<option>Select series</option>
						<option>Live Your Best Life</option>
						<option>Hope Rising</option>
						<option>Together</option>
						<option>Fearless</option>
					</select>
				</FormField>
				<FormField label="Date">
					<input type="date" />
				</FormField>
			</FormRow>

			<FormField label="Sermon Notes / Outline (optional)">
				<textarea placeholder="Paste sermon notes, outline, or supplemental text here..." />
			</FormField>

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
