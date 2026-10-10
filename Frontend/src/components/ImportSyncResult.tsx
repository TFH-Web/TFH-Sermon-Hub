// Show what a "Sync from YouTube" run returned: the queued job, or the import report.
import './ImportSyncResult.css';
import type { SyncResult } from '$/types/import';

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

/** Render a sync result: a job id for a queued run, or the counts and any non-empty lists for a finished one. */
export default function ImportSyncResult({ result }: { result: SyncResult }) {
	// A queued sync has no report yet, and there is no endpoint to read it once the worker finishes.
	if (result.queued) {
		return (
			<p className="ImportSyncResult" role="status">
				Sync queued. Job id: {result.jobId}
			</p>
		);
	}

	const { report } = result;
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
