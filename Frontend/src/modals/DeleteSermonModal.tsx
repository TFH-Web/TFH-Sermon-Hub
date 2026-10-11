import './DeleteSermonModal.css';
import { Icon } from '@iconify-icon/react';
import { useNavigate } from 'react-router-dom';
import{ useState } from 'react';
import Button from '$/components/Button';
import Modal from '$/components/Modal';
import { useToast } from '$/components/ToastContext';
import type { Sermon } from '../types/sermon';
import { useMsal } from '@azure/msal-react';

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
	const navigate = useNavigate();
	const { instance, accounts } = useMsal();
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleDelete = async () => {
		if(!sermon || isDeleting) return;

		setIsDeleting(true);
		setError(null);

		// Authentication with Microsoft using MSAL to acquire an access token
		try {
			const account = accounts[0];
			if (!account) {
				throw new Error('Sign in with Microsoft again');
			}

			const responseToken = await instance.acquireTokenSilent({account, scopes: ['openid', 'profile'],});

			const response = await fetch(`/api/sermons/${sermon.id}`, {
				method: 'DELETE',
				headers: {
					'Authorization': `Bearer ${responseToken.accessToken}`,
				},
			});

			if (!response.ok) 
				throw new Error(`Failed to delete sermon (${response.status})`);
			

		onClose();
		showToast('Sermon deleted successfully', 'success');
		navigate('/sermons');

		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to delete sermon';
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
					<Button variant="danger" onClick={handleDelete}>
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
				{error && (<p className="DeleteSermonModal-error">{error}</p>)}
			</div>
		</Modal>
	);
}
