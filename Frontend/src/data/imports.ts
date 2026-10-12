import type { ImportJob } from '../types/import';

export const dashboardImports: ImportJob[] = [
	{
		id: 'import-dash-1',
		title: 'Batch Import YouTube Library',
		subtitle: '148 videos, started 2 hrs ago',
		icon: 'youtube',
		status: 'active',
		progress: 72,
	},
	{
		id: 'import-dash-2',
		title: 'Sermon Notes 2024 Archive',
		subtitle: '56 documents',
		icon: 'file',
		status: 'complete',
	},
	{
		id: 'import-dash-3',
		title: 'Vimeo Import Legacy Content',
		subtitle: '12 videos failed transcription',
		icon: 'video',
		status: 'failed',
		errorMessage: '12 videos failed transcription',
	},
];
