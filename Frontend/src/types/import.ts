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
export const SyncResult = z.discriminatedUnion('queued', [
	z.object({ queued: z.literal(true), jobId: z.string() }),
	z.object({ queued: z.literal(false), report: ImportReport }),
]);
export type SyncResult = z.infer<typeof SyncResult>;
