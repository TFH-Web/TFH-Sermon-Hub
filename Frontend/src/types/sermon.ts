/* This file defines the interface for the sermon data structures used in the Sermons component. It includes properties such as title, speaker, series, date, time, and tags. */
export interface Sermon {
	id: number;
	title: string;
	speaker: string;
	series: string;
	date: Date;
	tags: string[];
	status: 'Published' | 'Processing' | 'Failed';
}

export function linkTo(sermon: Sermon): string {
	return `/sermons/#${sermon.id}`;
}
