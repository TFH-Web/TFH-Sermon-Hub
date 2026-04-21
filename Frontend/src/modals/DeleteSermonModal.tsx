import './DeleteSermonModal.css';
import { Icon } from '@iconify-icon/react';
import Button from '$/components/Button';
import Modal from '$/components/Modal';
import { useToast } from '$/components/ToastContext';
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

	const handleDelete = () => {
		onClose();
		showToast('Sermon deleted successfully', 'success');
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
					<Button variant="danger" onClick={handleDelete}>
						Delete Sermon
					</Button>
				</>
			}
		>
			<div className="DeleteSermonModal-body">
				<div className="DeleteSermonModal-icon">
					<Icon icon="mdi:trash-can-outline" width={24} height={24} />
				</div>
				<h2 className="DeleteSermonModal-title">
					Delete "{sermon?.title}"?
				</h2>
				<p className="DeleteSermonModal-message">
					This will permanently remove the sermon, transcript, tags, and all
					associated metadata. This action cannot be undone.
				</p>
			</div>
		</Modal>
	);
}