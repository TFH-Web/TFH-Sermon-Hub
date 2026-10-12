import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import './ImportUpload.css';
import Button from '$/components/Button';
import { Card, CardHeader } from '$/components/Card';
import ErrorBox from '$/components/ErrorBox';
import { FormField, FormRow } from '$/components/FormField';
import Loading from '$/components/Loading';
import MainLayout from '$/components/MainLayout';
import Pagination from '$/components/Pagination';
import SermonImportItem from '$/components/SermonImportItem';
import TabBar from '$/components/TabBar';
import Tag from '$/components/Tag';
import { useToast } from '$/components/ToastContext';
import UploadZone from '$/components/UploadZone';
import {
	IMPORT_SERMONS_KEY,
	invalidateSermonData,
	useImportSermons,
	useProcessingCount,
} from '$/hooks/useImportSermons';
import { apiErrorMessage } from '$/lib/api';
import BulkImportModal from '$/modals/BulkImportModal';
import UploadSermonModal from '$/modals/UploadSermonModal';
import { type BulkImport, SyncResult } from '$/types/import';
import type { Status } from '$/types/sermon';

const tabs = ['Upload New', 'Bulk Import', 'Import History', 'Failed Imports'];

const YOUTUBE_SOURCE = 'YouTube Channel';

function syncErrorMessage(error: unknown): string {
	if (axios.isAxiosError(error) && error.response?.status === 403) {
		return 'Only admins can sync from YouTube.';
	}
	return apiErrorMessage(error, 'Could not sync from YouTube. Try again.');
}

export default function ImportUpload() {
	const [activeTab, setActiveTab] = useState('Upload New');
	const [uploadOpen, setUploadOpen] = useState(false);
	const { showToast } = useToast();
	const queryClient = useQueryClient();
	const [source, setSource] = useState(YOUTUBE_SOURCE);
	const [dateFrom, setDateFrom] = useState('');
	const [dateTo, setDateTo] = useState('');
	const [dateError, setDateError] = useState('');
	// The sync that just ended, shown in a pop-up until it is closed.
	const [finishedRun, setFinishedRun] = useState<BulkImport | null>(null);
	// A sync can outlast this page, so its callbacks read this to know if the page is still there to show the outcome.
	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	// The lists refetch on a timer only while something is processing.
	const processing = useProcessingCount() > 0;
	// That timer stops with the last sermon, so fetch once more to show where it ended up.
	const wasProcessing = useRef(false);
	useEffect(() => {
		if (wasProcessing.current && !processing) {
			invalidateSermonData(queryClient);
		}
		wasProcessing.current = processing;
	}, [processing, queryClient]);

	// LIMITATION (backend): the "Syncing…" state does not survive a reload. A sync is one long request, which
	// the browser drops when the page reloads, and the backend keeps no record of a running sync to ask about.
	// The sync still finishes on the server, but this page cannot tell, and its result pop-up never appears.
	// Fixing it needs the backend to record sync runs and expose the latest one.
	const sync = useMutation({
		mutationFn: async (range: Pick<BulkImport, 'from' | 'to'>) => {
			// Only the dates that were filled in are sent. With neither, the whole channel is synced.
			const response = await axios.post('/api/import/youtube', {
				from: range.from || undefined,
				to: range.to || undefined,
			});
			return SyncResult.parse(response.data);
		},
		onSuccess: (result, range) => {
			invalidateSermonData(queryClient);
			if (mountedRef.current) {
				setFinishedRun({ ...range, result });
			} else if (result.queued) {
				// The page is gone, so there is nowhere to pop the result up. Say it in a toast instead.
				showToast('Sync queued.', 'info');
			} else {
				const { report } = result;
				showToast(
					`Sync finished. New sermons: ${report.sermons_created}. Updated: ${report.sermons_updated}.`,
					'success',
				);
			}
		},
		onError: (failure, range) => {
			const error = syncErrorMessage(failure);
			if (mountedRef.current) {
				setFinishedRun({ ...range, error });
			} else {
				showToast(error, 'error');
			}
		},
	});

	function handleSync() {
		if (sync.isPending) return;
		// Date inputs give YYYY-MM-DD, which sorts as text in date order.
		if (dateFrom && dateTo && dateFrom > dateTo) {
			setDateError('The start date must be on or before the end date.');
			return;
		}
		sync.mutate({ from: dateFrom, to: dateTo });
	}

	return (
		<MainLayout title="Import / Upload">
			<div className="ImportUpload-header">
				<h2 className="ImportUpload-heading">Import & Upload</h2>
			</div>

			<TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

			{activeTab === 'Upload New' && (
				<div className="ImportUpload-grid">
					<div>
						<UploadZone
							onClick={() => setUploadOpen(true)}
							className="ImportUpload-uploadZone"
						/>
						<Card>
							<CardHeader title="AI Processing Options" />
							<div className="Card-body">
								<div className="ImportUpload-checkboxGroup">
									<label className="ImportUpload-checkbox">
										<input type="checkbox" defaultChecked />
										Auto-generate transcript via AI
									</label>
									<label className="ImportUpload-checkbox">
										<input type="checkbox" defaultChecked />
										Auto-generate summary via AI
									</label>
									<label className="ImportUpload-checkbox">
										<input type="checkbox" defaultChecked />
										Auto-generate tags via AI
									</label>
								</div>
							</div>
						</Card>
					</div>

					<div>
						<ImportSermonList
							title="Active Imports"
							status="Processing"
							emptyText="No active imports"
							poll={processing}
						/>
					</div>
				</div>
			)}

			{activeTab === 'Bulk Import' && (
				<div className="ImportUpload-grid">
					<Card>
						<CardHeader title="Bulk Import from Library" />
						<div className="Card-body">
							{/* The source picks what the rest of the card shows. Only YouTube has an import behind it so far.
							    Both fields are locked while a sync runs. */}
							<FormField
								label="Import Source"
								className={clsx(sync.isPending && 'ImportUpload-locked')}
							>
								<select
									value={source}
									disabled={sync.isPending}
									onChange={e => setSource(e.target.value)}
								>
									<option>{YOUTUBE_SOURCE}</option>
									<option>Vimeo Account</option>
									<option>Local File Batch</option>
								</select>
							</FormField>
							{source === YOUTUBE_SOURCE ? (
								<>
									{/* There is no channel field: the channel is set on the server (YOUTUBE_CHANNEL_ID).
									    Date Range is sent as from/to. */}
									<FormField
										label="Date Range (optional)"
										error={dateError}
										className={clsx(sync.isPending && 'ImportUpload-locked')}
									>
										<FormRow>
											<input
												type="date"
												aria-label="From date"
												value={dateFrom}
												disabled={sync.isPending}
												onChange={e => {
													setDateFrom(e.target.value);
													setDateError('');
												}}
											/>
											<input
												type="date"
												aria-label="To date"
												value={dateTo}
												disabled={sync.isPending}
												onChange={e => {
													setDateTo(e.target.value);
													setDateError('');
												}}
											/>
										</FormRow>
									</FormField>
									{/* The result pops up in BulkImportModal when the sync ends. */}
									<Button
										variant="primary"
										disabled={sync.isPending}
										aria-busy={sync.isPending}
										onClick={handleSync}
									>
										{sync.isPending ? 'Syncing…' : 'Sync from YouTube'}
									</Button>
								</>
							) : (
								<p className="ImportUpload-empty">Unavailable</p>
							)}
						</div>
					</Card>

					<ImportSermonList
						title="Active Imports"
						status="Processing"
						emptyText="No active imports"
						poll={processing}
					/>
				</div>
			)}

			{activeTab === 'Import History' && (
				<ImportSermonList
					title="Import History"
					status="Published"
					emptyText="No import history yet"
					poll={processing}
				/>
			)}

			{activeTab === 'Failed Imports' && (
				<ImportSermonList
					title="Failed Imports"
					status="Failed"
					emptyText="No failed imports"
					poll={processing}
					showCount
				/>
			)}

			<UploadSermonModal
				isOpen={uploadOpen}
				onClose={() => setUploadOpen(false)}
			/>
			{finishedRun && (
				<BulkImportModal
					run={finishedRun}
					isOpen
					onClose={() => setFinishedRun(null)}
				/>
			)}
		</MainLayout>
	);
}

interface ImportSermonListProps {
	title: string;
	status: Status;
	emptyText: string;
	poll: boolean;
	// Show the number of sermons in the card header, as the Failed Imports card does.
	showCount?: boolean;
}

/** A card listing the sermons with one status, ten to a page, with its own loading, error and empty states. */
function ImportSermonList({
	title,
	status,
	emptyText,
	poll,
	showCount = false,
}: ImportSermonListProps) {
	const queryClient = useQueryClient();
	const [page, setPage] = useState(1);
	const query = useImportSermons(status, page, poll);
	const totalPages = query.data?.totalPages ?? 0;

	// Sermons leave a list as they finish, which can leave the page being shown past the end.
	useEffect(() => {
		if (totalPages > 0 && page > totalPages) setPage(totalPages);
	}, [page, totalPages]);

	return (
		<Card>
			<CardHeader
				title={title}
				action={
					showCount && <Tag variant="red">{query.data?.total ?? 0} items</Tag>
				}
			/>
			<div className="Card-body">
				{query.isPending ? (
					<Loading />
				) : query.isError ? (
					<ErrorBox
						message={`Failed to load ${title.toLowerCase()}.`}
						// Refetch every import query, not just this one, so polling picks up again too.
						onRetry={() =>
							queryClient.invalidateQueries({ queryKey: [IMPORT_SERMONS_KEY] })
						}
					/>
				) : query.data.total === 0 ? (
					<p className="ImportUpload-empty">{emptyText}</p>
				) : (
					<>
						{query.data.items.map(sermon => (
							<SermonImportItem key={sermon.id} sermon={sermon} />
						))}
						{totalPages > 1 && (
							<Pagination
								className="ImportUpload-pagination"
								pageInfo={query.data}
								onPageChange={setPage}
								// True only while another page loads, so a poll does not flicker the buttons.
								isLoading={query.isPlaceholderData}
							/>
						)}
					</>
				)}
			</div>
		</Card>
	);
}
