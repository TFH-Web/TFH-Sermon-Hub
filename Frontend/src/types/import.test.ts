import { describe, expect, it } from 'vitest';
import { SyncResult } from './import';

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
