import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { type ChangeEvent, useState } from 'react';
import Button from '$/components/Button';
import { FormField } from '$/components/FormField';
import Modal from '$/components/Modal';
import { useToast } from '$/components/ToastContext';
import { apiErrorMessage } from '$/lib/api';

interface NewSeriesModalProps {
	isOpen: boolean;
	onClose: () => void;
	// Called after the series is saved, so the page can jump to where the new series shows up
	onCreated?: () => void;
}

// A series only has a title for now. Description, start date and primary speaker were removed
// from this form because the Series table has no columns to store them.
export default function NewSeriesModal({
	isOpen,
	onClose,
	onCreated,
}: NewSeriesModalProps) {
	const { showToast } = useToast();
	const queryClient = useQueryClient();

	const [seriesName, setSeriesName] = useState('');
	const [error, setError] = useState('');

	const createSeries = useMutation({
		mutationFn: async (title: string) => {
			await axios.post('/api/series', { title });
		},
		onSuccess: async () => {
			// Prefix match: refreshes the cached series list for every page
			await queryClient.invalidateQueries({ queryKey: ['series'] });
			setSeriesName('');
			setError('');
			onClose();
			showToast('Series created', 'success');
			onCreated?.();
		},
		onError: failure => {
			setError(
				axios.isAxiosError(failure) && failure.response?.status === 403
					? 'Only admins can create series.'
					: apiErrorMessage(failure, 'Could not create the series. Try again.'),
			);
		},
	});

	const handleCreateSeries = () => {
		if (!seriesName.trim()) {
			setError('Series name is required');
			return;
		}
		createSeries.mutate(seriesName.trim());
	};

	const handleSeriesNameChange = (event: ChangeEvent<HTMLInputElement>) => {
		setSeriesName(event.target.value);
		if (error) setError('');
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="New Series"
			size="lg"
			footer={
				<>
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={handleCreateSeries}
						disabled={createSeries.isPending}
						aria-busy={createSeries.isPending}
					>
						{createSeries.isPending ? 'Creating…' : 'Create Series'}
					</Button>
				</>
			}
		>
			<div>
				<FormField label="Series Name" error={error}>
					<input
						type="text"
						placeholder="e.g. Live Your Best Life"
						name="seriesName"
						value={seriesName}
						disabled={createSeries.isPending}
						onChange={handleSeriesNameChange}
					/>
				</FormField>
			</div>
		</Modal>
	);
}
