import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import clsx from 'clsx';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import './ImportUpload.css';
import ActiveSyncItem from '$/components/ActiveSyncItem';
import Button from '$/components/Button';
import { Card, CardHeader } from '$/components/Card';
import ErrorBox from '$/components/ErrorBox';
import { FormField, FormRow } from '$/components/FormField';
import Loading from '$/components/Loading';
import MainLayout from '$/components/MainLayout';
import Pagination from '$/components/Pagination';
import SermonImportItem from '$/components/SermonImportItem';
import SyncRunHistory from '$/components/SyncRunHistory';
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
import { SYNC_RUNS_KEY, useSyncRuns } from '$/hooks/useSyncRuns';
import { apiErrorMessage } from '$/lib/api';
import { formatDateRange } from '$/lib/date';
import { isActiveRun } from '$/lib/syncRuns';
import BulkImportModal from '$/modals/BulkImportModal';
import UploadSermonModal from '$/modals/UploadSermonModal';
import {
	type BulkImport,
	type SyncRange,
	SyncResult,
	SyncStartFailure,
} from '$/types/import';
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
	// The sync whose report or error is showing in the pop-up, until it is closed.
	const [openRun, setOpenRun] = useState<BulkImport | null>(null);
	// The sync this page has seen going, so its end is reported once. See the effect below.
	const watchedRunId = useRef<number | null>(null);
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

	const sync = useMutation({
		mutationFn: async (range: SyncRange) => {
			// Only the dates that were filled in are sent. With neither, the whole channel is synced.
			const response = await axios.post('/api/import/youtube', {
				from: range.from || undefined,
				to: range.to || undefined,
			});
			return SyncResult.parse(response.data);
		},
		onSuccess: async result => {
			// A sync that finished inside the request is reported here, not by the effect below.
			if (!result.queued) watchedRunId.current = null;
			// Every outcome saved a run. Waiting for the list keeps the button locked until a queued run shows as active.
			await queryClient.invalidateQueries({ queryKey: [SYNC_RUNS_KEY] });
			if (result.queued) {
				// Nothing has been imported yet. The run shows in Active Imports until the worker finishes it.
				showToast('Sync queued.', 'info');
				return;
			}
			invalidateSermonData(queryClient);
			if (mountedRef.current) {
				setOpenRun({ runId: result.runId });
			} else {
				// The page is gone, so there is nowhere to pop the result up. Say it in a toast instead.
				const { report } = result;
				showToast(
					`Sync finished. New sermons: ${report.sermons_created}. Updated: ${report.sermons_updated}.`,
					'success',
				);
			}
		},
		onError: async (failure, range) => {
			// A sync that was refused or failed after it was saved is a run too.
			await queryClient.invalidateQueries({ queryKey: [SYNC_RUNS_KEY] });
			if (axios.isAxiosError(failure) && failure.response?.status === 409) {
				// Only one sync runs at a time, and this is not a failure: the one already going shows in Active Imports.
				showToast(
					apiErrorMessage(failure, 'A YouTube sync is already in progress.'),
					'info',
				);
				return;
			}
			const error = syncErrorMessage(failure);
			// A sync that failed after the server saved it names its run. The pop-up reads that run, which says why it failed.
			const saved = SyncStartFailure.safeParse(
				axios.isAxiosError(failure) ? failure.response?.data : undefined,
			);
			if (saved.success) watchedRunId.current = null;
			if (!mountedRef.current) {
				showToast(error, 'error');
			} else if (saved.success) {
				setOpenRun({ runId: saved.data.runId });
			} else {
				setOpenRun({ ...range, error });
			}
		},
	});

	// The server saves every sync as a run, so the recent ones (and whether one is still going) survive a reload.
	// A sync that is queued or running, started here or anywhere else, keeps the form locked until it ends.
	const runs = useSyncRuns();
	const activeRun = runs.query.data?.find(isActiveRun);
	const syncing = sync.isPending || activeRun !== undefined;
	let syncLabel = 'Sync from YouTube';
	if (sync.isPending || activeRun?.state === 'running') {
		syncLabel = 'Syncing…';
	} else if (activeRun) {
		syncLabel = 'Sync queued…';
	}

	// A sync this page has seen going is reported once, when it ends: its report or error pops up, and the lists it
	// changed are refetched. One that was already over when the page loaded is not, since it is in Sync History.
	useEffect(() => {
		const list = runs.query.data;
		if (!list) return;
		const going = list.find(isActiveRun);
		if (going) {
			watchedRunId.current = going.id;
			return;
		}
		const watched = watchedRunId.current;
		if (watched === null) return;
		watchedRunId.current = null;
		if (list.some(run => run.id === watched)) {
			invalidateSermonData(queryClient);
			setOpenRun({ runId: watched });
		}
	}, [runs.query.data, queryClient]);

	// A sync that is going is an active import, so it leads the Active Imports list.
	let activeSync: ReactNode = null;
	if (activeRun) {
		activeSync = (
			<ActiveSyncItem
				range={formatDateRange(activeRun.dateFrom ?? '', activeRun.dateTo ?? '')}
				state={activeRun.state === 'queued' ? 'queued' : 'running'}
				since={
					activeRun.state === 'queued'
						? activeRun.createdAt
						: (activeRun.startedAt ?? activeRun.createdAt)
				}
				stalled={!runs.polling}
				onCheckStatus={runs.checkNow}
			/>
		);
	} else if (sync.isPending && sync.variables) {
		// Without a job queue the sync runs inside this request, so no run can be read until it ends. Show it from the dates sent.
		activeSync = (
			<ActiveSyncItem
				range={formatDateRange(sync.variables.from, sync.variables.to)}
				state="running"
				since={null}
				stalled={false}
				onCheckStatus={runs.checkNow}
			/>
		);
	}

	function handleSync() {
		if (syncing) return;
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
							leading={activeSync}
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
								className={clsx(syncing && 'ImportUpload-locked')}
							>
								<select
									value={source}
									disabled={syncing}
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
										className={clsx(syncing && 'ImportUpload-locked')}
									>
										<FormRow>
											<input
												type="date"
												aria-label="From date"
												value={dateFrom}
												disabled={syncing}
												onChange={e => {
													setDateFrom(e.target.value);
													setDateError('');
												}}
											/>
											<input
												type="date"
												aria-label="To date"
												value={dateTo}
												disabled={syncing}
												onChange={e => {
													setDateTo(e.target.value);
													setDateError('');
												}}
											/>
										</FormRow>
									</FormField>
									{/* A sync that runs inside the request pops its result up in BulkImportModal. One that is going shows in Active Imports, and a finished one in Sync History on the Import History tab. */}
									<Button
										variant="primary"
										disabled={syncing}
										aria-busy={syncing}
										onClick={handleSync}
									>
										{syncLabel}
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
						leading={activeSync}
					/>
				</div>
			)}

			{activeTab === 'Import History' && (
				<div className="ImportUpload-grid">
					<SyncRunHistory
						runs={runs}
						onOpen={run => setOpenRun({ runId: run.id })}
					/>
					<ImportSermonList
						title="Import History"
						status="Published"
						emptyText="No import history yet"
						poll={processing}
					/>
				</div>
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
			{openRun && (
				<BulkImportModal
					run={openRun}
					isOpen
					onClose={() => setOpenRun(null)}
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
	// Rows to show above the sermons, such as a sync that is going. With any, the empty text is not shown.
	leading?: ReactNode;
}

/** A card listing the sermons with one status, ten to a page, with its own loading, error and empty states. */
function ImportSermonList({
	title,
	status,
	emptyText,
	poll,
	showCount = false,
	leading = null,
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
				{leading}
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
					leading === null && (
						<p className="ImportUpload-empty">{emptyText}</p>
					)
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
