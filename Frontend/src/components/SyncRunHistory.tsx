// The Import page's list of finished YouTube syncs. The runs come from the server, so it reads the same after a reload.
// A sync that is still going is not listed here: it shows first in Active Imports (see ActiveSyncItem).
import { Icon } from '@iconify-icon/react';
import clsx from 'clsx';
import './ImportItem.css';
import './SyncRunHistory.css';
import { Card, CardHeader } from '$/components/Card';
import ErrorBox from '$/components/ErrorBox';
import Loading from '$/components/Loading';
import Tag from '$/components/Tag';
import type { SyncRunsResult } from '$/hooks/useSyncRuns';
import { formatDateRange, formatTimestamp } from '$/lib/date';
import { isActiveRun, runErrorMessage, syncTitle } from '$/lib/syncRuns';
import type { SyncRun } from '$/types/import';

const COUNTS = [
	['sermonsCreated', 'created'],
	['sermonsUpdated', 'updated'],
	['sermonsUnchanged', 'unchanged'],
] as const;

/** A card listing the finished syncs, with its own loading, error and empty states. Takes the result of useSyncRuns so the page and the card share one poll. */
export default function SyncRunHistory({ runs }: { runs: SyncRunsResult }) {
	const { query, checkNow } = runs;
	const finished = query.data?.filter(run => !isActiveRun(run)) ?? [];

	return (
		<Card>
			<CardHeader title="Sync History" />
			<div className="Card-body">
				{query.isPending ? (
					<Loading />
				) : query.isError ? (
					<ErrorBox message="Failed to load sync history." onRetry={checkNow} />
				) : finished.length === 0 ? (
					<p className="SyncRunHistory-empty">No finished syncs yet</p>
				) : (
					finished.map(run => <SyncRunItem key={run.id} run={run} />)
				)}
			</div>
		</Card>
	);
}

/** One finished sync in the list. It uses ImportItem's styles, so it looks like the sermon rows beside it. */
function SyncRunItem({ run }: { run: SyncRun }) {
	const failed = run.state === 'failed';
	const details = [`Submitted ${formatTimestamp(run.createdAt)}`];
	if (run.state === 'succeeded') {
		// The counts are null until a run succeeds.
		for (const [key, label] of COUNTS) {
			const count = run[key];
			if (count !== null) details.push(`${count.toLocaleString()} ${label}`);
		}
	}

	return (
		<div className={clsx('ImportItem', failed && 'ImportItem--failed')}>
			<h4 className="ImportItem-title">
				{syncTitle(formatDateRange(run.dateFrom ?? '', run.dateTo ?? ''))}
			</h4>
			<p className="ImportItem-subtitle">{details.join(' • ')}</p>
			{failed && (
				<p className="ImportItem-error">{runErrorMessage(run.error)}</p>
			)}
			<Icon
				icon={failed ? 'lucide:alert-triangle' : 'lucide:video'}
				width={20}
				className={clsx('ImportItem-icon', failed && 'ImportItem-icon--failed')}
			/>
			<div className="ImportItem-action">
				{failed ? (
					<Tag variant="red" className="Action-badge Action-badge--failed">
						Failed
					</Tag>
				) : (
					<Tag variant="green" className="Action-badge Action-badge--complete">
						Complete
					</Tag>
				)}
			</div>
		</div>
	);
}
