// The Import page's YouTube sync runs, read from the server so they survive a reload, and the polling that follows a run in progress.
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { isActiveRun } from '$/lib/syncRuns';
import { SyncRun } from '$/types/import';

export const SYNC_RUNS_KEY = 'sync-runs';
const POLL_INTERVAL = 5000;
// The backend only gives up on a queued run after 24 hours, so polling cannot go on until then.
// After this long the page stops asking and shows a Check status button instead.
const POLL_WINDOW = 10 * 60 * 1000;

/**
 * The 20 most recent runs, newest first, without their reports. Refetches every few seconds while one is queued or running,
 * for up to POLL_WINDOW. `polling` is false once that has passed with a run still active, and `checkNow` refetches and starts the window again.
 */
export function useSyncRuns() {
	const [expired, setExpired] = useState(false);
	const [restarts, setRestarts] = useState(0);

	const query = useQuery({
		queryKey: [SYNC_RUNS_KEY],
		queryFn: async () => {
			const response = await axios.get('/api/import/youtube/runs');
			return SyncRun.array().parseAsync(response.data);
		},
		// Every failed fetch raises a toast (see main.tsx) that stays until closed, so stop polling after one.
		refetchInterval: current =>
			!expired &&
			current.state.status !== 'error' &&
			current.state.data?.some(isActiveRun)
				? POLL_INTERVAL
				: false,
	});

	const active = query.data?.some(isActiveRun) ?? false;

	// The window starts when a run becomes active, and again on each Check status. `restarts` is only there to re-arm the timer.
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

export type SyncRunsResult = ReturnType<typeof useSyncRuns>;
