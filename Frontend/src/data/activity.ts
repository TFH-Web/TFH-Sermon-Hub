import type { ActivityItem } from "$/types/activity";

export const activities: ActivityItem[] = [
	{
		id: '1',
		type: 'success',
		boldPart: 'Someone',
		text: 'Someone uploaded "Under Grace"',
		time: '2 hours ago',
	},
	{
		id: '2',
		type: 'success',
		boldPart: 'AI Engine',
		text: 'AI Engine generated transcript for "Walking in Freedom"',
		time: '3 hours ago',
	},
	{
		id: '3',
		type: 'system',
		boldPart: 'System',
		text: 'System — Bulk import 72% complete',
		time: '4 hours ago',
	},
	{
		id: '4',
		type: 'error',
		boldPart: 'Import Error',
		text: 'Import Error — "Bold Faith" transcription failed',
		time: '5 hours ago',
	},
	{
		id: '5',
		type: 'info',
		boldPart: 'Email sent',
		text: 'Email sent — Upload complete notification to admin',
		time: 'Yesterday',
	},
];

