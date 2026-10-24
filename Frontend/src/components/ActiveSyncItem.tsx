// A YouTube sync that is queued or running, shown first in Active Imports in the same row as the sermons being processed.
import { Icon } from '@iconify-icon/react';
import './ImportItem.css';
import './ActiveSyncItem.css';
import Button from '$/components/Button';
import Tag from '$/components/Tag';
import { formatTimestamp } from '$/lib/date';
import { syncTitle } from '$/lib/syncRuns';

interface ActiveSyncItemProps {
	// The date range the sync was asked for, as formatDateRange words it.
	range: string;
	state: 'queued' | 'running';
	// When the run was queued or started, as the server sent it. null for a sync this page has only just asked for.
	since: string | null;
	// Polling has given up, so the sync has to be looked at by hand.
	stalled: boolean;
	onCheckStatus: () => void;
}

/**
 * The server reports no progress while a sync runs: its counts come with the report when it ends,
 * so this shows the sync's state rather than a bar.
 */
export default function ActiveSyncItem({
	range,
	state,
	since,
	stalled,
	onCheckStatus,
}: ActiveSyncItemProps) {
	const queued = state === 'queued';
	let subtitle = 'Starting…';
	if (since !== null) {
		subtitle = `${queued ? 'Queued' : 'Started'} ${formatTimestamp(since)}`;
	}

	return (
		<>
			<div className="ImportItem">
				<h4 className="ImportItem-title">{syncTitle(range)}</h4>
				<p className="ImportItem-subtitle">{subtitle}</p>
				<Icon icon="lucide:video" width={20} className="ImportItem-icon" />
				<div className="ImportItem-action">
					<Tag variant={queued ? 'blue' : 'amber'} className="Action-badge">
						{queued ? 'Queued' : 'Running'}
					</Tag>
				</div>
			</div>
			{stalled && (
				<div className="ActiveSyncItem-stalled">
					<p>This page stopped checking on its own.</p>
					<Button variant="secondary" size="sm" onClick={onCheckStatus}>
						Check status
					</Button>
				</div>
			)}
		</>
	);
}
