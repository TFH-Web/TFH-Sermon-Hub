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

describe('SyncResult schema', () => {
	it('parses a queued sync', () => {
		const queued = { queued: true, jobId: 'a1b2c3' };
		expect(SyncResult.parse(queued)).toEqual(queued);
	});

	it('parses a finished sync with its report', () => {
		const finished = { queued: false, report };
		expect(SyncResult.parse(finished)).toEqual(finished);
	});

	it('rejects a queued sync with no job id', () => {
		expect(() => SyncResult.parse({ queued: true })).toThrow();
	});

	it('rejects a finished sync with no report', () => {
		expect(() =>
			SyncResult.parse({ queued: false, jobId: 'a1b2c3' }),
		).toThrow();
	});

	it('rejects a report with a list missing', () => {
		const incomplete = { ...report, queue_failures: undefined };
		expect(() =>
			SyncResult.parse({ queued: false, report: incomplete }),
		).toThrow();
	});

	it('rejects a report whose count is not a number', () => {
		const wrong = { ...report, sermons_created: '11' };
		expect(() => SyncResult.parse({ queued: false, report: wrong })).toThrow();
	});

	it('rejects a result that does not say whether it was queued', () => {
		expect(() => SyncResult.parse({ report })).toThrow();
	});
});
