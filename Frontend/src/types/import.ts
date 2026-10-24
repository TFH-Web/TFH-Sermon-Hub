import z from 'zod';

export interface ImportJob {
	id: string;
	title: string;
	subtitle: string;
	icon: string;
	status: 'active' | 'complete' | 'failed';
	progress?: number;
	errorMessage?: string;
}

// What a YouTube channel sync did: ImportReport.as_dict() in Backend/tsh/youtube_import.py.
// The keys are snake_case because the report is sent as is, not through a camel-casing schema.
export const ImportReport = z.object({
	series_created: z.number(),
	sermons_created: z.number(),
	sermons_updated: z.number(),
	sermons_unchanged: z.number(),
	skipped_playlists: z.string().array(),
	skipped_private: z.string().array(),
	skipped_not_ready: z.string().array(),
	skipped_too_long: z.string().array(),
	multiple_series: z.string().array(),
	unknown_speakers: z.string().array(),
	multiple_speakers: z.string().array(),
	queue_failures: z.string().array(),
});
export type ImportReport = z.infer<typeof ImportReport>;

// POST /api/import/youtube: queued on the worker (202), or already run inside the request (200) with its report.
// Both carry the id of the run the server saved, which GET /api/import/youtube/runs/<id> reads back (see docs/youtube-sync-runs.md).
export const SyncResult = z.discriminatedUnion('queued', [
	z.object({
		queued: z.literal(true),
		jobId: z.string(),
		runId: z.number(),
		state: z.literal('queued'),
	}),
	z.object({
		queued: z.literal(false),
		report: ImportReport,
		runId: z.number(),
		state: z.literal('succeeded'),
	}),
]);
export type SyncResult = z.infer<typeof SyncResult>;

// The 409, 502 and 503 error bodies of POST /api/import/youtube also name the run they are about, next to their message.
export const SyncStartFailure = z.object({ runId: z.number() });

// A run only moves forward: queued, running, then succeeded or failed.
export const SyncRunState = z.enum(['queued', 'running', 'succeeded', 'failed']);
export type SyncRunState = z.infer<typeof SyncRunState>;

// One saved sync, from GET /api/import/youtube/runs and /runs/<id>. Its fields are camelCase, but the report keeps
// ImportReport's snake_case keys. Dates are YYYY-MM-DD; timestamps are UTC without a zone suffix (see parseUtcTimestamp).
export const SyncRun = z.object({
	id: z.number(),
	// The range that was asked for. null means that end was left open.
	dateFrom: z.string().nullable(),
	dateTo: z.string().nullable(),
	state: SyncRunState,
	createdAt: z.string(),
	startedAt: z.string().nullable(),
	finishedAt: z.string().nullable(),
	// The report's counts, null unless the run succeeded.
	seriesCreated: z.number().nullable(),
	sermonsCreated: z.number().nullable(),
	sermonsUpdated: z.number().nullable(),
	sermonsUnchanged: z.number().nullable(),
	// Only the detail endpoint sends the report, and only once the run has succeeded.
	report: ImportReport.nullish(),
	error: z.string().nullable(),
});
export type SyncRun = z.infer<typeof SyncRun>;

// The dates a sync was asked for, as YYYY-MM-DD. Empty when that end was left open.
export interface SyncRange {
	from: string;
	to: string;
}

// What the "YouTube bulk import" pop-up opens on: a run the server saved, which it reads back by id, or,
// when the request failed before a run was saved (a bad date, not an admin), why it failed.
export type BulkImport = { runId: number } | (SyncRange & { error: string });
