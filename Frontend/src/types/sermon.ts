import z from 'zod';
import type { TagVariant } from '$/components/Tag';
import { CalendarDate } from '$/lib/date';
import { paginated } from './pagination';
import { Series } from './series';
import { Speaker } from './speaker';
import { Tag } from './tag';

/* This file defines the interface for the sermon data structures used in the Sermons component. It includes properties such as title, speaker, series, date, time, and tags. */
export const statuses = ['Published', 'Processing', 'Draft', 'Failed'] as const;
export const Status = z.enum(statuses);
export type Status = z.infer<typeof Status>;

// Where "Regenerate with AI" is. The server keeps this on the sermon, so every tab and a reloaded page see the same thing.
export const summaryRegenStates = [
	'idle',
	'queued',
	'running',
	'completed',
	'failed',
] as const;
export const SummaryRegenState = z.enum(summaryRegenStates);
export type SummaryRegenState = z.infer<typeof SummaryRegenState>;

export const Sermon = z.object({
	id: z.number(),
	title: z.string().nonempty(),
	videoLink: z.string(), // Keep legacy text readable; shared builders decide whether it is safe to link.
	youtubeVideoId: z.string().nullish(), // Keep the stored ID so the frontend can check it against the link.
	duration: z.number().nonnegative(),
	date: CalendarDate,
	description: z.string().nonempty(),
	tags: Tag.array(),
	transcript: z.string().nullish(),
	summary: z.string().nullish(),
	summarySource: z.enum(['ai', 'manual']).nullish(), // Missing or null means the summary's origin is unknown.
	speaker: Speaker,
	series: Series.nullish(),
	status: Status,
	processingError: z.string().nullish(),
	processedAt: z.string().nullish(),
	summaryRegenState: SummaryRegenState.optional(),
	summaryRegenError: z.string().nullish(),
	summaryRegenRequestedAt: z.string().nullish(),
	summaryRegenStartedAt: z.string().nullish(),
});
export type Sermon = z.infer<typeof Sermon>;

export const PaginatedSermons = paginated(Sermon.array());
export type PaginatedSermons = z.infer<typeof PaginatedSermons>;

export function linkTo(sermon: Sermon): string {
	return `/sermons/${sermon.id}`;
}

const MS_TO_S = 1000;

export function durationToDateTime(duration: number) {
	const date = new Date(duration * MS_TO_S);
	const h = date.getUTCHours();
	const m = date.getUTCMinutes();
	const s = date.getUTCSeconds();

	return `PT${h}H${m}M${s}S`;
}

export function durationToString(duration: number) {
	const date = new Date(duration * MS_TO_S);
	const h = date.getUTCHours();
	const m = date.getUTCMinutes();
	const s = date.getUTCSeconds();

	const pad = (n: number) => n.toString().padStart(2, '0');

	if (h > 0) {
		return `${h}:${pad(m)}:${pad(s)}`;
	} else {
		return `${m}:${pad(s)}`;
	}
}

export interface OverlayInfo {
	tagVariant: TagVariant;
	icon: string;
	text: string;
}

export function createOverlayInfo(status: Status): OverlayInfo {
	switch (status) {
		case 'Processing':
			return {
				tagVariant: 'amber',
				icon: 'lucide:file-clock',
				text: 'Processing',
			};
		case 'Draft':
			return {
				tagVariant: 'blue',
				icon: 'lucide:file-text',
				text: 'Drafting',
			};
		case 'Published':
			return {
				tagVariant: 'green',
				icon: 'lucide:check',
				text: 'Published',
			};
		default:
			return {
				tagVariant: 'red',
				icon: 'lucide:alert-triangle',
				text: 'Transcription Failed',
			};
	}
}

export const statusVariant = (status: Status): TagVariant =>
	createOverlayInfo(status).tagVariant;
