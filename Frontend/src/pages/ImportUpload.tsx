import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import './ImportUpload.css';
import Button from '$/components/Button';
import { Card, CardHeader } from '$/components/Card';
import { FormField, FormRow } from '$/components/FormField';
import ImportItem from '$/components/ImportItem';
import ImportSyncResult from '$/components/ImportSyncResult';
import MainLayout from '$/components/MainLayout';
import TabBar from '$/components/TabBar';
import Tag from '$/components/Tag';
import { useToast } from '$/components/ToastContext';
import UploadZone from '$/components/UploadZone';
import { activeImports, failedImports, importHistory } from '$/data/imports';
import { apiErrorMessage } from '$/lib/api';
import UploadSermonModal from '$/modals/UploadSermonModal';
import { SyncResult } from '$/types/import';

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
	// A sync can outlast this page, so its callbacks read this to know if there is still a card to show the result in.
	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const sync = useMutation({
		mutationFn: async (range: { from?: string; to?: string }) => {
			const response = await axios.post('/api/import/youtube', range);
			return SyncResult.parse(response.data);
		},
		onSuccess: result => {
			if (result.queued) {
				showToast('Sync queued.', 'info');
			} else {
				const { report } = result;
				showToast(
					`Sync finished. New sermons: ${report.sermons_created}. Updated: ${report.sermons_updated}.`,
					'success',
				);
			}

			const stale = [
				'sermons',
				'paginated-sermons',
				'series',
				'speakers',
				'paginated-speakers',
			];
			for (const key of stale) {
				queryClient.invalidateQueries({ queryKey: [key] });
			}
		},
		onError: failure => {
			// The card shows the error itself while this page is open.
			if (!mountedRef.current) showToast(syncErrorMessage(failure), 'error');
		},
	});

	function handleSync() {
		if (sync.isPending) return;
		// Date inputs give YYYY-MM-DD, which sorts as text in date order.
		if (dateFrom && dateTo && dateFrom > dateTo) {
			setDateError('The start date must be on or before the end date.');
			return;
		}
		// Only the dates that were filled in are sent. With neither, the whole channel is synced.
		sync.mutate({ from: dateFrom || undefined, to: dateTo || undefined });
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
						<Card>
							<CardHeader title="Active Imports" />
							<div className="Card-body">
								{activeImports.length > 0 ? (
									activeImports.map(job => (
										<ImportItem key={job.id} job={job} />
									))
								) : (
									<p className="ImportUpload-empty">No active imports</p>
								)}
							</div>
						</Card>
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
									<Button
										variant="primary"
										disabled={sync.isPending}
										aria-busy={sync.isPending}
										onClick={handleSync}
									>
										{sync.isPending ? 'Syncing…' : 'Sync from YouTube'}
									</Button>
									{sync.isError && (
										<p className="ImportUpload-syncError" role="alert">
											{syncErrorMessage(sync.error)}
										</p>
									)}
									{sync.data && <ImportSyncResult result={sync.data} />}
								</>
							) : (
								<p className="ImportUpload-empty">Unavailable</p>
							)}
						</div>
					</Card>

					<Card>
						<CardHeader title="Active Imports" />
						<div className="Card-body">
							{activeImports.map(job => (
								<ImportItem key={job.id} job={job} />
							))}
						</div>
					</Card>
				</div>
			)}

			{activeTab === 'Import History' && (
				<Card>
					<CardHeader title="Import History" />
					<div className="Card-body">
						{importHistory.length > 0 ? (
							importHistory.map(job => <ImportItem key={job.id} job={job} />)
						) : (
							<p className="ImportUpload-empty">No import history yet</p>
						)}
					</div>
				</Card>
			)}

			{activeTab === 'Failed Imports' && (
				<Card>
					<CardHeader
						title="Failed Imports"
						action={<Tag variant="red">{failedImports.length} items</Tag>}
					/>
					<div className="Card-body">
						{failedImports.length > 0 ? (
							failedImports.map(job => <ImportItem key={job.id} job={job} />)
						) : (
							<p className="ImportUpload-empty">No failed imports</p>
						)}
					</div>
				</Card>
			)}

			<UploadSermonModal
				isOpen={uploadOpen}
				onClose={() => setUploadOpen(false)}
			/>
		</MainLayout>
	);
}
