import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '$/components/ToastContext.tsx';
import type { Sermon, SummaryRegenState } from '$/types/sermon';

// How often to ask the server while a regeneration is waiting or running.
export const REGEN_POLL_MS = 2000;
// The server lets a new request take over from one this old, so there is nothing left to wait for.
// Match pipeline.REGEN_STALE_AFTER: the 15-minute worker timeout plus 5 minutes.
export const REGEN_GIVE_UP_MS = 20 * 60 * 1000;

// Waiting for the worker, or being worked on.
export function isRegenActive(state: SummaryRegenState | undefined): boolean {
	return state === 'queued' || state === 'running';
}

// The server sends times as UTC without a zone marker, so add one before reading them.
function parseUtc(text: string): number {
	return Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(text) ? text : `${text}Z`);
}

function lastActivity(sermon: Sermon | undefined): number {
	const timestamp =
		sermon?.summaryRegenStartedAt ?? sermon?.summaryRegenRequestedAt;
	return timestamp ? parseUtc(timestamp) : Number.NaN;
}

function isRegenStale(sermon: Sermon | undefined, now: number): boolean {
	return (
		isRegenActive(sermon?.summaryRegenState) &&
		now - lastActivity(sermon) > REGEN_GIVE_UP_MS
	);
}

// For useQuery's refetchInterval: keep checking while the job is active, then stop.
export function regenPollInterval(
	sermon: Sermon | undefined,
	now: number = Date.now(),
): number | false {
	if (!sermon || !isRegenActive(sermon.summaryRegenState)) return false;
	if (isRegenStale(sermon, now)) return false;
	return REGEN_POLL_MS;
}

// Starts a summary regeneration and reports how it went. The state itself lives on the sermon, not in this page.
export function useSummaryRegeneration(
	id: string | undefined,
	sermon: Sermon | undefined,
) {
	const queryClient = useQueryClient();
	const { showToast } = useToast();
	const state = sermon?.summaryRegenState;
	const sending = useRef(false); // Stops a second click before the page has redrawn
	const [isSending, setIsSending] = useState(false);
	const [now, setNow] = useState(Date.now);
	const previous = useRef<SummaryRegenState | undefined>(undefined);
	const activity = lastActivity(sermon);
	const isStale = isRegenStale(sermon, now);

	// Unchanged polling results need not re-render React. Wake at the claim's exact
	// expiry so a lost worker cannot leave the button disabled after polling stops.
	useEffect(() => {
		if (!isRegenActive(state) || !Number.isFinite(activity)) return;
		const remaining = activity + REGEN_GIVE_UP_MS + 1 - Date.now();
		const timer = window.setTimeout(
			() => setNow(Date.now()),
			Math.max(0, remaining),
		);
		return () => window.clearTimeout(timer);
	}, [activity, state]);

	// Say how it ended, but only when we watched it finish, not when a page loads with an old result.
	useEffect(() => {
		const wasActive = isRegenActive(previous.current);
		previous.current = state;
		if (!wasActive) return;
		// A request timestamp identifies completion even when two inline requests
		// both arrive as "completed", without announcing untracked legacy content.
		if (state === 'completed' && sermon?.summaryRegenRequestedAt) {
			showToast('The summary was regenerated.', 'success');
		} else if (state === 'failed') {
			showToast(
				sermon?.summaryRegenError || 'Could not regenerate the summary',
				'error',
			);
		}
	}, [
		state,
		sermon?.summaryRegenError,
		sermon?.summaryRegenRequestedAt,
		showToast,
	]);

	const start = async () => {
		if (
			sending.current ||
			(isRegenActive(state) && !isRegenStale(sermon, Date.now()))
		)
			return;
		sending.current = true;
		setIsSending(true);
		try {
			await axios.post(`/api/sermons/${id}/regenerate-summary`);
			// With no job queue the summary is already done, and this is the only moment we see it start.
			previous.current = 'queued';
		} catch (error) {
			// The server sends a readable message for the cases people can act on, like a request already running.
			const message =
				(axios.isAxiosError(error) && error.response?.data?.error) ||
				'Could not regenerate the summary';
			showToast(message, 'error');
		} finally {
			// Success or not, show what the server says now.
			try {
				await queryClient.invalidateQueries({ queryKey: ['sermon', id] });
			} finally {
				sending.current = false;
				setIsSending(false);
			}
		}
	};

	return {
		state,
		error: sermon?.summaryRegenError,
		isStale,
		isActive: isSending || (isRegenActive(state) && !isStale),
		start,
	};
}
