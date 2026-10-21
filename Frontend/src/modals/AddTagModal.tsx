import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { type ChangeEvent, useState } from 'react';
import Button from '$/components/Button';
import { FormField } from '$/components/FormField';
import Modal from '$/components/Modal';
// import "./AddTagModal.css"
import { useToast } from '$/components/ToastContext';
import { invalidateTagData } from '$/hooks/useTags';
import { apiErrorMessage } from '$/lib/api';

interface AddTagModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function AddTagModal({ isOpen, onClose }: AddTagModalProps) {
	const { showToast } = useToast();
	const queryClient = useQueryClient();
	const [tag, setTag] = useState('');
	const [error, setError] = useState('');

	const addTag = useMutation({
		mutationFn: async (name: string) => {
			await axios.post('/api/tags', { name });
		},
		onSuccess: async () => {
			await invalidateTagData(queryClient);
			setTag('');
			setError('');
			onClose();
			showToast('Tag Added', 'success');
		},
		onError: failure => {
			setError(
				axios.isAxiosError(failure) && failure.response?.status === 403
					? 'Only admins can add tags.'
					: apiErrorMessage(failure, 'Could not add the tag. Try again.'),
			);
		},
	});

	const handleTag = () => {
		if (!tag.trim()) {
			setError('Tag is required');
			return;
		}
		addTag.mutate(tag.trim());
	};
	const handleTagChange = (
		event: ChangeEvent<HTMLInputElement, HTMLInputElement>,
	) => {
		setTag(event.target.value);
		if (error) setError('');
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="Add Tag"
			size="lg"
			footer={
				<>
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={handleTag}
						disabled={addTag.isPending}
						aria-busy={addTag.isPending}
					>
						{addTag.isPending ? 'Adding…' : 'Add Tag'}
					</Button>
				</>
			}
		>
			<div>
				<FormField label="Tag Name" error={error}>
					<input
						type="text"
						placeholder="e.g. forgiveness"
						name="tag"
						value={tag}
						disabled={addTag.isPending}
						onChange={handleTagChange}
					/>
				</FormField>
			</div>
		</Modal>
	);
}
