export interface ImportJob {
	id: string;
	title: string;
	subtitle: string;
	icon: string;
	status: 'active' | 'complete' | 'failed';
	progress?: number;
	errorMessage?: string;
}
