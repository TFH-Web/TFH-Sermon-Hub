/* This file defines the interface for the sermon data structures used in the Sermons component. It includes properties such as title, speaker, series, date, time, and tags. */
export const statuses = ['Published', 'Processing', 'Draft', 'Failed'] as const;
export type Status = (typeof statuses)[number];

export interface Sermon {
	id: number;
	title: string;
	speaker: string;
	series: string | null;
	date: Date;
	tags: string[];
	status: Status;
	duration: number;
}

export function linkTo(sermon: Sermon): string {
	return `/sermons#${sermon.id}`;
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
