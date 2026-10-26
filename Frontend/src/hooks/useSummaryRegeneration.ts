import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useRef } from 'react';
import { useToast } from '$/components/ToastContext.tsx';
import type { Sermon, SummaryRegenState } from '$/types/sermon';

// How often to ask the server while a regeneration is waiting or running.
export const REGEN_POLL_MS = 2000;
// The server lets a new request take over from one this old, so there is nothing left to wait for.
export const REGEN_GIVE_UP_MS = 25 * 60 * 1000;

// Waiting for the worker, or being worked on.
export function isRegenActive(state: SummaryRegenState | undefined): boolean {
	return state === 'queued' || state === 'running';
}

// The server sends times as UTC without a zone marker, so add one before reading them.
function parseUtc(text: string): number {
	return Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(text) ? text : `${text}Z`);
}

// For useQuery's refetchInterval: keep checking while the job is active, then stop.
export function regenPollInterval(
	sermon: Sermon | undefined,
	now: number = Date.now(),
): number | false {
	if (!sermon || !isRegenActive(sermon.summaryRegenState)) return false;
	const requested = sermon.summaryRegenRequestedAt
		? parseUtc(sermon.summaryRegenRequestedAt)
		: Number.NaN;
	if (now - requested > REGEN_GIVE_UP_MS) return false;
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
	const previous = useRef<SummaryRegenState | undefined>(undefined);

	// Say how it ended, but only when we watched it finish, not when a page loads with an old result.
	useEffect(() => {
		const wasActive = isRegenActive(previous.current);
		previous.current = state;
		if (!wasActive) return;
		if (state === 'completed') {
			showToast('The summary was regenerated.', 'success');
		} else if (state === 'failed') {
			showToast(
				sermon?.summaryRegenError || 'Could not regenerate the summary',
				'error',
			);
		}
	}, [state, sermon?.summaryRegenError, showToast]);

	const start = async () => {
		if (sending.current || isRegenActive(state)) return;
		sending.current = true;
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
			sending.current = false;
			// Success or not, show what the server says now.
			await queryClient.invalidateQueries({ queryKey: ['sermon', id] });
		}
	};

	return {
		state,
		error: sermon?.summaryRegenError,
		isActive: isRegenActive(state),
		start,
	};
}
