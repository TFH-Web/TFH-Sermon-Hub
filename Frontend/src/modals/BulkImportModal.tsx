// Pops up to report a "Sync from YouTube" run: what it was asked for, and how it is going or how it went.
import './BulkImportModal.css';
import Button from '$/components/Button';
import ErrorBox from '$/components/ErrorBox';
import ImportSyncResult from '$/components/ImportSyncResult';
import Loading from '$/components/Loading';
import Modal from '$/components/Modal';
import { useSyncRun } from '$/hooks/useSyncRuns';
import { isNotFound } from '$/lib/api';
import { formatDateRange, formatTimestamp } from '$/lib/date';
import { isActiveRun, runErrorMessage } from '$/lib/syncRuns';
import type { BulkImport, SyncRunState } from '$/types/import';

const STATE_LABEL: Record<SyncRunState, string> = {
	queued: 'Queued',
	running: 'Running',
	succeeded: 'Complete',
	failed: 'Failed',
};

interface BulkImportModalProps {
	run: BulkImport;
	isOpen: boolean;
	onClose: () => void;
}

export default function BulkImportModal({
	run,
	isOpen,
	onClose,
}: BulkImportModalProps) {
	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="YouTube bulk import"
			footer={
				<Button variant="secondary" onClick={onClose}>
					Close
				</Button>
			}
		>
			{'runId' in run ? (
				<SyncRunView runId={run.runId} />
			) : (
				// The request failed before the server saved a run, so there is nothing to read back.
				<>
					<dl className="BulkImportModal-facts">
						<dt>Date range</dt>
						<dd>{formatDateRange(run.from, run.to)}</dd>
					</dl>
					<p className="BulkImportModal-error" role="alert">
						{run.error}
					</p>
				</>
			)}
		</Modal>
	);
}

/** A saved run, read from the server. While it is queued or running it keeps checking, and the report appears when it succeeds. */
function SyncRunView({ runId }: { runId: number }) {
	const { query, polling, checkNow } = useSyncRun(runId);

	if (query.isPending) return <Loading />;
	if (query.isError) {
		return isNotFound(query.error) ? (
			<ErrorBox message="This sync no longer exists." />
		) : (
			<ErrorBox message="Failed to load this sync." onRetry={checkNow} />
		);
	}

	const run = query.data;
	return (
		<>
			<dl className="BulkImportModal-facts">
				<dt>Date range</dt>
				<dd>{formatDateRange(run.dateFrom ?? '', run.dateTo ?? '')}</dd>
				<dt>Status</dt>
				<dd>{STATE_LABEL[run.state]}</dd>
				<dt>Submitted</dt>
				<dd>{formatTimestamp(run.createdAt)}</dd>
				{run.finishedAt && (
					<>
						<dt>Finished</dt>
						<dd>{formatTimestamp(run.finishedAt)}</dd>
					</>
				)}
			</dl>

			{isActiveRun(run) && (
				<div className="BulkImportModal-waiting" role="status">
					<p>
						{run.state === 'queued'
							? 'Waiting for the worker to start this sync.'
							: 'Importing videos from YouTube.'}{' '}
						The counts and any errors appear here when it ends.
					</p>
					{/* Polling gives up after a while, so a sync that is still going needs a way to be looked at again. */}
					{!polling && (
						<Button variant="secondary" size="sm" onClick={checkNow}>
							Check status
						</Button>
					)}
				</div>
			)}
			{run.state === 'failed' && (
				<p className="BulkImportModal-error" role="alert">
					{runErrorMessage(run.error)}
				</p>
			)}
			{run.report && <ImportSyncResult report={run.report} />}
		</>
	);
}
