// The Import page's YouTube sync runs, read from the server so they survive a reload, and the polling that follows a run in progress.
import { type QueryKey, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { isNotFound } from '$/lib/api';
import { isActiveRun } from '$/lib/syncRuns';
import { SyncRun } from '$/types/import';

// The key of the list. Each run read by id is stored under it too, so invalidating this refetches both.
export const SYNC_RUNS_KEY = 'sync-runs';
// Exported so the tests can move time by the same amounts.
export const POLL_INTERVAL = 5000;
// The backend only gives up on a queued run after 24 hours, so polling cannot go on until then.
// After this long the page stops asking and shows a Check status button instead.
export const POLL_WINDOW = 10 * 60 * 1000;

/**
 * A query that refetches every few seconds while `isActive` says what it fetched is still changing, for up to POLL_WINDOW.
 * `polling` is false once that has passed with it still active, and `checkNow` refetches and starts the window again.
 */
function usePolledQuery<T>(
	queryKey: QueryKey,
	queryFn: () => Promise<T>,
	isActive: (data: T) => boolean,
) {
	const [expired, setExpired] = useState(false);
	const [restarts, setRestarts] = useState(0);

	const query = useQuery({
		queryKey,
		queryFn,
		// A run id that does not exist will not exist on the third try either.
		retry: (failureCount, error) => !isNotFound(error) && failureCount < 3,
		// Every failed fetch raises a toast (see main.tsx) that stays until closed, so stop polling after one.
		refetchInterval: current =>
			!expired &&
			current.state.status !== 'error' &&
			current.state.data !== undefined &&
			isActive(current.state.data)
				? POLL_INTERVAL
				: false,
	});

	const active = query.data !== undefined && isActive(query.data);

	// The window starts when the data becomes active, and again on each Check status. `restarts` is only there to re-arm the timer.
	// biome-ignore lint/correctness/useExhaustiveDependencies: restarts is read only to restart the window
	useEffect(() => {
		setExpired(false);
		if (!active) return;
		const timer = setTimeout(() => setExpired(true), POLL_WINDOW);
		return () => clearTimeout(timer);
	}, [active, restarts]);

	return {
		query,
		polling: active && !expired,
		checkNow() {
			setRestarts(count => count + 1);
			query.refetch();
		},
	};
}

/** The 20 most recent runs, newest first, without their reports. Polls while one is queued or running. */
export function useSyncRuns() {
	return usePolledQuery(
		[SYNC_RUNS_KEY],
		async () => {
			const response = await axios.get('/api/import/youtube/runs');
			return SyncRun.array().parseAsync(response.data);
		},
		runs => runs.some(isActiveRun),
	);
}

/** One run with its full report (null until it succeeds). Polls while it is queued or running. */
export function useSyncRun(runId: number) {
	return usePolledQuery(
		[SYNC_RUNS_KEY, runId],
		async () => {
			const response = await axios.get(`/api/import/youtube/runs/${runId}`);
			return SyncRun.parseAsync(response.data);
		},
		isActiveRun,
	);
}

export type SyncRunsResult = ReturnType<typeof useSyncRuns>;
