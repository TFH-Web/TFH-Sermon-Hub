// Show what a finished "Sync from YouTube" run reported: its counts and the lists of anything skipped or needing attention.
import './ImportSyncResult.css';
import type { ImportReport } from '$/types/import';

const COUNTS = [
	['series_created', 'Series created'],
	['sermons_created', 'Sermons created'],
	['sermons_updated', 'Sermons updated'],
	['sermons_unchanged', 'Sermons unchanged'],
] as const;

// In the order the backend builds them. Entries are ready-made lines, e.g. "Title (video id): 75 min", shown as is.
const LISTS = [
	['skipped_playlists', 'Skipped playlists'],
	['skipped_private', 'Skipped: private or deleted'],
	['skipped_not_ready', 'Skipped: still streaming'],
	['skipped_too_long', 'Skipped: too long'],
	['multiple_series', 'In more than one series'],
	['unknown_speakers', 'Unknown speaker'],
	['multiple_speakers', 'More than one speaker'],
	['queue_failures', 'Could not be queued'],
] as const;

/** Render a sync's report: the counts, and any lists that are not empty. */
export default function ImportSyncResult({ report }: { report: ImportReport }) {
	return (
		<section className="ImportSyncResult" aria-label="Sync result">
			<h4 className="ImportSyncResult-title">Sync finished</h4>
			<dl className="ImportSyncResult-counts">
				{COUNTS.map(([key, label]) => (
					<div key={key} className="ImportSyncResult-count">
						<dt>{label}</dt>
						<dd>{report[key].toLocaleString()}</dd>
					</div>
				))}
			</dl>
			{LISTS.map(([key, label]) => {
				// Entries double as React keys, so drop any repeats.
				const entries = [...new Set(report[key])];
				if (entries.length === 0) return null;
				return (
					<details key={key} className="ImportSyncResult-list">
						<summary>
							{label} ({entries.length})
						</summary>
						<ul>
							{entries.map(entry => (
								<li key={entry}>{entry}</li>
							))}
						</ul>
					</details>
				);
			})}
		</section>
	);
}
