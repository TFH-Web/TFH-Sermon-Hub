// Delete a tag. Its sermon associations are removed by the backend's cascading FK on Tag.name.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Button from '$/components/Button';
import Modal from '$/components/Modal';
import { useToast } from '$/components/ToastContext';
import { invalidateTagData } from '$/hooks/useTags';
import { apiErrorMessage } from '$/lib/api';
import type { CountedTag } from '$/types/tag';

interface DeleteTagModalProps {
	isOpen: boolean;
	onClose: () => void;
	tag: CountedTag | null;
}

export default function DeleteTagModal({
	isOpen,
	onClose,
	tag,
}: DeleteTagModalProps) {
	const { showToast } = useToast();
	const queryClient = useQueryClient();

	const deleteTag = useMutation({
		mutationFn: async (name: string) => {
			await axios.delete('/api/tags', { params: { name } });
		},
		onSuccess: async () => {
			await invalidateTagData(queryClient);
			onClose();
			showToast('Tag deleted', 'success');
		},
		onError: failure => {
			showToast(
				axios.isAxiosError(failure) && failure.response?.status === 403
					? 'Only admins can delete tags.'
					: apiErrorMessage(failure, 'Could not delete the tag. Try again.'),
				'error',
			);
		},
	});

	if (!tag) return null;

	const handleDelete = () => {
		deleteTag.mutate(tag.name);
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} title="Delete Tag">
			<p>Are you sure you want to delete "{tag.name}"?</p>

			<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
				<Button variant="secondary" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={handleDelete}
					disabled={deleteTag.isPending}
					aria-busy={deleteTag.isPending}
				>
					{deleteTag.isPending ? 'Deleting…' : 'Delete'}
				</Button>
			</div>
		</Modal>
	);
}
