import { describe, expect, it } from 'vitest';
import type { SyncRun } from '../types/import';
import { isActiveRun, runErrorMessage, syncTitle } from './syncRuns';

function run(state: SyncRun['state']): SyncRun {
	return {
		id: 1,
		dateFrom: null,
		dateTo: null,
		state,
		createdAt: '2026-10-20T06:49:24.744828',
		startedAt: null,
		finishedAt: null,
		seriesCreated: null,
		sermonsCreated: null,
		sermonsUpdated: null,
		sermonsUnchanged: null,
		error: null,
	};
}

describe('isActiveRun', () => {
	it.each([
		['queued', true],
		['running', true],
		['succeeded', false],
		['failed', false],
	] as const)('says a %s run is active: %s', (state, active) => {
		expect(isActiveRun(run(state))).toBe(active);
	});
});

describe('runErrorMessage', () => {
	it('explains a run that could not be queued', () => {
		expect(runErrorMessage('queue: Connection refused')).toBe(
			'The job queue was unavailable, so the sync never started. Try again.',
		);
	});

	it('explains a run whose worker was lost', () => {
		expect(runErrorMessage('worker: no result within 20 minutes')).toBe(
			'The sync was lost before it finished. Try again.',
		);
	});

	it("shows the import's own message as it is", () => {
		expect(runErrorMessage('videos: HTTP 500: backendError')).toBe(
			'videos: HTTP 500: backendError',
		);
	});

	it('still says something when the run has no error saved', () => {
		expect(runErrorMessage(null)).toBe('The sync failed.');
	});

	it('only treats a prefix as a prefix', () => {
		expect(runErrorMessage('The queue: was fine')).toBe('The queue: was fine');
	});
});

describe('syncTitle', () => {
	it('puts the date range after the name, the same on every card', () => {
		expect(syncTitle('Sep 1, 2026 – Sep 30, 2026')).toBe(
			'YouTube Library Import • Sep 1, 2026 – Sep 30, 2026',
		);
	});
});
