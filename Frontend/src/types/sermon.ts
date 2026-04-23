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
	return `/sermons/#${sermon.id}`;
}
