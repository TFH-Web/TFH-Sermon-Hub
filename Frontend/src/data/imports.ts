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

export const activeImports: ImportJob[] = [
	{
		id: 'import-active-1',
		title: 'YouTube Library Import',
		subtitle: '148 videos \u2022 107 complete, 41 remaining',
		icon: 'youtube',
		status: 'active',
		progress: 72,
	},
	{
		id: 'import-active-2',
		title: 'AI Processing Queue',
		subtitle: 'Transcripts: 12 pending \u2022 Tags: 8 pending',
		icon: 'ai',
		status: 'active',
	},
];

export const importHistory: ImportJob[] = [
	{
		id: 'import-hist-1',
		title: 'YouTube Library Import',
		subtitle: '148 videos • Completed Feb 20, 2026',
		icon: 'lucide:video',
		status: 'complete',
	},
	{
		id: 'import-hist-2',
		title: 'Sermon Notes — 2024 Archive',
		subtitle: '56 documents • Completed Feb 15, 2026',
		icon: 'lucide:file-text',
		status: 'complete',
	},
	{
		id: 'import-hist-3',
		title: 'Vimeo Import — Legacy Content',
		subtitle: '89 videos • Completed Jan 28, 2026 • 12 errors',
		icon: 'lucide:video',
		status: 'complete',
		errorMessage: '12 videos failed transcription',
	},
	{
		id: 'import-hist-4',
		title: 'Manual Upload — "Under Grace"',
		subtitle: 'Single file • Completed Feb 23, 2026',
		icon: 'lucide:upload',
		status: 'complete',
	},
];

export const failedImports: ImportJob[] = [
	{
		id: 'import-failed-1',
		title: 'Bold Faith Transcription Error',
		subtitle: 'Jan 19, 2026',
		icon: 'error',
		status: 'failed',
		errorMessage: 'Audio quality too low for AI processing',
	},
	{
		id: 'import-failed-2',
		title: 'Sunday Worship 2019 Video Not Found',
		subtitle: '2019 Archive',
		icon: 'error',
		status: 'failed',
		errorMessage: 'YouTube link returned 404',
	},
	{
		id: 'import-failed-3',
		title: 'Notes Upload Format Error',
		subtitle: 'Document Upload',
		icon: 'error',
		status: 'failed',
		errorMessage: 'Unsupported file type: .pages',
	},
];
