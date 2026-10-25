// Rename an existing tag. Sermon associations carry over automatically (the backend
// updates the tag's primary key, which cascades), so there's nothing else to wire here.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { type ChangeEvent, useEffect, useState } from 'react';
import Button from '$/components/Button';
import { FormField } from '$/components/FormField';
import Modal from '$/components/Modal';
import { useToast } from '$/components/ToastContext';
import { invalidateTagData } from '$/hooks/useTags';
import { apiErrorMessage } from '$/lib/api';
import type { CountedTag } from '$/types/tag';

interface EditTagModalProps {
	isOpen: boolean;
	onClose: () => void;
	tag: CountedTag | null;
}

export default function EditTagModal({
	isOpen,
	onClose,
	tag,
}: EditTagModalProps) {
	const { showToast } = useToast();
	const queryClient = useQueryClient();
	const [name, setName] = useState('');
	const [error, setError] = useState('');

	// Fill the field with the current name each time a different tag is opened for editing.
	useEffect(() => {
		if (isOpen && tag) {
			setName(tag.name);
			setError('');
		}
	}, [isOpen, tag]);

	const renameTag = useMutation({
		mutationFn: async (newName: string) => {
			if (!tag) return;
			// A query identifier preserves slashes and dot-only names without path normalization.
			await axios.patch(
				'/api/tags',
				{ newName },
				{ params: { name: tag.name } },
			);
		},
		onSuccess: async () => {
			await invalidateTagData(queryClient);
			onClose();
			showToast('Tag renamed', 'success');
		},
		onError: failure => {
			setError(
				axios.isAxiosError(failure) && failure.response?.status === 403
					? 'Only admins can rename tags.'
					: apiErrorMessage(failure, 'Could not rename the tag. Try again.'),
			);
		},
	});

	if (!tag) return null;

	const handleSave = () => {
		if (!name.trim()) {
			setError('Tag name is required');
			return;
		}
		renameTag.mutate(name.trim());
	};
	const handleNameChange = (
		event: ChangeEvent<HTMLInputElement, HTMLInputElement>,
	) => {
		setName(event.target.value);
		if (error) setError('');
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="Edit Tag"
			size="lg"
			footer={
				<>
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={handleSave}
						disabled={renameTag.isPending}
						aria-busy={renameTag.isPending}
					>
						{renameTag.isPending ? 'Saving…' : 'Save'}
					</Button>
				</>
			}
		>
			<div>
				<FormField label="Tag Name" error={error}>
					<input
						type="text"
						placeholder="e.g. forgiveness"
						name="name"
						value={name}
						disabled={renameTag.isPending}
						onChange={handleNameChange}
					/>
				</FormField>
			</div>
		</Modal>
	);
}
