import type { SyncRun } from '$/types/import';

/** What a sync is called on its cards, in Active Imports and in Sync History, e.g. "YouTube Library Import • Sep 1, 2026 – Sep 30, 2026". */
export function syncTitle(range: string): string {
	return `YouTube Library Import • ${range}`;
}

/** A sync is over only when it succeeded or failed. Queued and running both mean it is still going. */
export function isActiveRun(run: SyncRun): boolean {
	return run.state === 'queued' || run.state === 'running';
}

/**
 * Say why a sync failed. The backend prefixes the error by where it went wrong (docs/youtube-sync-runs.md):
 * "queue: " when it could not be queued, "worker: " when it was given up on as lost, and anything else is the import's own message.
 */
export function runErrorMessage(error: string | null): string {
	if (!error) return 'The sync failed.';
	if (error.startsWith('queue: ')) {
		return 'The job queue was unavailable, so the sync never started. Try again.';
	}
	if (error.startsWith('worker: ')) {
		return 'The sync was lost before it finished. Try again.';
	}
	return error;
}
