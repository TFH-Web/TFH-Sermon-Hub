import './DeleteSermonModal.css';
import { Icon } from '@iconify-icon/react';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import Button from '$/components/Button';
import Modal from '$/components/Modal';
import { useToast } from '$/components/ToastContext';
import { invalidateSermonData } from '$/hooks/useImportSermons';
import { apiErrorMessage } from '$/lib/api';
import type { Sermon } from '../types/sermon';

interface DeleteSermonModalProps {
	isOpen: boolean;
	onClose: () => void;
	sermon: Sermon | null;
}

export default function DeleteSermonModal({
	isOpen,
	onClose,
	sermon,
}: DeleteSermonModalProps) {
	const { showToast } = useToast();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleDelete = async () => {
		if (!sermon || isDeleting) return;

		setIsDeleting(true);
		setError(null);

		try {
			await axios.delete(`/api/sermons/${sermon.id}`);
			await invalidateSermonData(queryClient);

			onClose();
			showToast('Sermon deleted successfully', 'success');
			navigate('/sermons');
		} catch (err) {
			const message = apiErrorMessage(
				err,
				'Failed to delete sermon. Please try again.',
			);
			setError(message);
			showToast(message, 'error');
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			size="sm"
			footer={
				<>
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="danger" onClick={handleDelete} disabled={isDeleting}>
						{isDeleting ? 'Deleting...' : 'Delete Sermon'}
					</Button>
				</>
			}
		>
			<div className="DeleteSermonModal-body">
				<div className="DeleteSermonModal-icon">
					<Icon icon="mdi:trash-can-outline" width={24} height={24} />
				</div>
				<h2 className="DeleteSermonModal-title">Delete "{sermon?.title}"?</h2>
				<p className="DeleteSermonModal-message">
					This will permanently remove the sermon, transcript, tags, and all
					associated metadata. This action cannot be undone.
				</p>
				{error && (
					<p role="alert" className="DeleteSermonModal-error">
						{error}
					</p>
				)}
			</div>
		</Modal>
	);
}
