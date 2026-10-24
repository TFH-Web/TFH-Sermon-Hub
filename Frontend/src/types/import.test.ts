import { describe, expect, it } from 'vitest';
import { SyncResult, SyncRun, SyncStartFailure } from './import';

// A finished sync's report, as POST /api/import/youtube sends it.
const report = {
	series_created: 3,
	sermons_created: 11,
	sermons_updated: 2,
	sermons_unchanged: 431,
	skipped_playlists: [],
	skipped_private: ['vPriv000001'],
	skipped_not_ready: [],
	skipped_too_long: ["The Father's House - Pursuit (vLong000001): 61 min"],
	multiple_series: [],
	unknown_speakers: [],
	multiple_speakers: [],
	queue_failures: [],
};

// Every response also names the run the server saved, and the state it is in.
const saved = { runId: 4, state: 'succeeded' };

describe('SyncResult schema', () => {
	it('parses a queued sync', () => {
		const queued = { queued: true, jobId: 'a1b2c3', runId: 4, state: 'queued' };
		expect(SyncResult.parse(queued)).toEqual(queued);
	});

	it('parses a finished sync with its report', () => {
		const finished = { queued: false, report, ...saved };
		expect(SyncResult.parse(finished)).toEqual(finished);
	});

	it('rejects a queued sync with no job id', () => {
		expect(() =>
			SyncResult.parse({ queued: true, runId: 4, state: 'queued' }),
		).toThrow();
	});

	it('rejects a finished sync with no report', () => {
		expect(() =>
			SyncResult.parse({ queued: false, jobId: 'a1b2c3', ...saved }),
		).toThrow();
	});

	it('rejects a sync with no run id', () => {
		expect(() =>
			SyncResult.parse({ queued: true, jobId: 'a1b2c3', state: 'queued' }),
		).toThrow();
	});

	it('rejects a report with a list missing', () => {
		const incomplete = { ...report, queue_failures: undefined };
		expect(() =>
			SyncResult.parse({ queued: false, report: incomplete, ...saved }),
		).toThrow();
	});

	it('rejects a report whose count is not a number', () => {
		const wrong = { ...report, sermons_created: '11' };
		expect(() =>
			SyncResult.parse({ queued: false, report: wrong, ...saved }),
		).toThrow();
	});

	it('rejects a result that does not say whether it was queued', () => {
		expect(() => SyncResult.parse({ report, ...saved })).toThrow();
	});
});

// A saved run as GET /api/import/youtube/runs sends it: queued, so nothing has started and there are no counts.
const queuedRun = {
	id: 4,
	dateFrom: null,
	dateTo: '2026-09-30',
	state: 'queued',
	createdAt: '2026-10-20T06:49:24.750747',
	startedAt: null,
	finishedAt: null,
	seriesCreated: null,
	sermonsCreated: null,
	sermonsUpdated: null,
	sermonsUnchanged: null,
	error: null,
};

describe('SyncRun schema', () => {
	it('parses a queued run, which has no counts and no report', () => {
		expect(SyncRun.parse(queuedRun)).toEqual(queuedRun);
	});

	it('parses a succeeded run with its counts and report', () => {
		const succeeded = {
			...queuedRun,
			state: 'succeeded',
			startedAt: '2026-10-20T06:49:24.752000',
			finishedAt: '2026-10-20T06:49:25.100000',
			seriesCreated: 3,
			sermonsCreated: 11,
			sermonsUpdated: 2,
			sermonsUnchanged: 431,
			report,
		};
		expect(SyncRun.parse(succeeded)).toEqual(succeeded);
	});

	it('parses a failed run with its error and no report', () => {
		const failed = {
			...queuedRun,
			state: 'failed',
			finishedAt: '2026-10-20T06:49:25.100000',
			report: null,
			error: 'queue: Connection refused',
		};
		expect(SyncRun.parse(failed)).toEqual(failed);
	});

	it('parses the list of runs', () => {
		expect(SyncRun.array().parse([queuedRun, { ...queuedRun, id: 3 }])).toHaveLength(2);
	});

	it('rejects a state it does not know', () => {
		expect(() => SyncRun.parse({ ...queuedRun, state: 'paused' })).toThrow();
	});

	it('rejects a run with no id', () => {
		expect(() => SyncRun.parse({ ...queuedRun, id: undefined })).toThrow();
	});

	it('rejects a count that is not a number', () => {
		expect(() =>
			SyncRun.parse({ ...queuedRun, sermonsCreated: '11' }),
		).toThrow();
	});
});

describe('SyncStartFailure schema', () => {
	it('reads the run id from a refused or failed sync, whatever else the body says', () => {
		const body = {
			error: 'The job queue is unavailable. Please try again later.',
			message: 'The job queue is unavailable. Please try again later.',
			runId: 3,
			state: 'failed',
		};
		expect(SyncStartFailure.parse(body)).toEqual({ runId: 3 });
	});

	it('rejects an error body that names no run', () => {
		expect(() =>
			SyncStartFailure.parse({ error: 'Not an admin', message: 'Not an admin' }),
		).toThrow();
	});
});
