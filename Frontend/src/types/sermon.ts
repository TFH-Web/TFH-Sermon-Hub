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

export const sampleSermons: Sermon[] = [
	{
		id: 1,
		title: 'Under Grace',
		speaker: 'Dave Patterson',
		series: 'Live Your Best Life',
		date: new Date('Feb 23 2026'),
		status: 'Published',
		tags: [],
	},
	{
		id: 2,
		title: 'Walking in Freedom',
		speaker: 'Dave Patterson',
		series: 'Live Your Best Life',
		date: new Date('Feb 16 2026'),
		status: 'Published',
		tags: [],
	},
	{
		id: 3,
		title: 'Anchored in Hope',
		speaker: 'Guest Speaker',
		series: 'Hope Rising',
		date: new Date('Feb 9 2026'),
		status: 'Processing',
		tags: [],
	},
	{
		id: 4,
		title: 'Power of Community',
		speaker: 'Dave Patterson',
		series: 'Together',
		date: new Date('Feb 2 2026'),
		status: 'Published',
		tags: [],
	},
	{
		id: 5,
		title: 'Bold Faith',
		speaker: 'Dave Patterson',
		series: 'Fearless',
		date: new Date('Jan 26 2026'),
		status: 'Failed',
		tags: [],
	},
];
