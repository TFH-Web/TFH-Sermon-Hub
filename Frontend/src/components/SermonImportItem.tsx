// One sermon in the Import page's lists. It uses ImportItem's styles, so it looks like those rows.
import { Icon } from '@iconify-icon/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import clsx from 'clsx';
import './ImportItem.css';
import { invalidateSermonData } from '$/hooks/useImportSermons';
import { apiErrorMessage } from '$/lib/api';
import { formatCalendarDate } from '$/lib/date';
import { linkTo, Sermon, type Status } from '$/types/sermon';
import { getFullName } from '$/types/speaker';
import { useUser } from '$/types/user';
import Button from './Button';
import Tag from './Tag';
import { useToast } from './ToastContext';

export default function SermonImportItem({ sermon }: { sermon: Sermon }) {
	const user = useUser();
	const failed = sermon.status === 'Failed';
	const date = formatCalendarDate(sermon.date);

	return (
		<div className={clsx('ImportItem', failed && 'ImportItem--failed')}>
			<h4 className="ImportItem-title">
				<a href={linkTo(sermon)}>{sermon.title}</a>
			</h4>
			<p className="ImportItem-subtitle">
				{getFullName(sermon.speaker)} • {date}
			</p>
			{failed && sermon.processingError && (
				<p className="ImportItem-error">{sermon.processingError}</p>
			)}
			<Icon
				icon={failed ? 'lucide:alert-triangle' : 'lucide:video'}
				width={20}
				className={clsx('ImportItem-icon', failed && 'ImportItem-icon--failed')}
			/>
			<div className="ImportItem-action">
				<StatusBadge status={sermon.status} />
				{/* The reprocess endpoint is Admin only, as with "Refresh captions" on the sermon page. */}
				{failed && user?.role === 'Admin' && <RetryButton sermon={sermon} />}
			</div>
		</div>
	);
}

/** Run the processing pipeline on a failed sermon again. Each row has its own, so only the one clicked goes busy. */
function RetryButton({ sermon }: { sermon: Sermon }) {
	const { showToast } = useToast();
	const queryClient = useQueryClient();
	const retry = useMutation({
		mutationFn: async () => {
			const response = await axios.post(`/api/sermons/${sermon.id}/reprocess`);
			return Sermon.parse(response.data);
		},
		onSuccess: async updated => {
			// Without a job queue the pipeline has already run, so the response can say it failed again.
			// The row would look the same as before, so say so. A retry that worked just moves the row.
			if (updated.status === 'Failed') {
				showToast(
					`"${updated.title}" failed again: ${updated.processingError ?? 'unknown error'}`,
					'error',
				);
			}
			// Waiting here keeps the button busy until the lists have refetched and this row has moved or changed.
			await Promise.all([
				invalidateSermonData(queryClient),
				queryClient.invalidateQueries({
					queryKey: ['sermon', String(sermon.id)],
				}),
			]);
		},
		onError: failure => {
			showToast(
				axios.isAxiosError(failure) && failure.response?.status === 403
					? 'Only admins can retry processing.'
					: apiErrorMessage(failure, 'Could not retry. Try again.'),
				'error',
			);
		},
	});

	return (
		<Button
			variant="secondary"
			size="sm"
			disabled={retry.isPending}
			aria-busy={retry.isPending}
			onClick={() => {
				if (!retry.isPending) retry.mutate();
			}}
		>
			{retry.isPending ? 'Retrying…' : 'Retry'}
		</Button>
	);
}

function StatusBadge({ status }: { status: Status }) {
	switch (status) {
		case 'Processing':
			return (
				<Tag variant="amber" className="Action-badge">
					Processing
				</Tag>
			);
		case 'Published':
			return (
				<Tag variant="green" className="Action-badge Action-badge--complete">
					Complete
				</Tag>
			);
		case 'Failed':
			return (
				<Tag variant="red" className="Action-badge Action-badge--failed">
					Failed
				</Tag>
			);
		default:
			// Drafts are not listed on the Import page.
			return null;
	}
}
