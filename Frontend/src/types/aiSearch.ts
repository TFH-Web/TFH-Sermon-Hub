export type AISearchContentType = 'sermon' | 'transcript' | 'note';

export interface AISearchResultPreview {
	id: string;
	title: string;
	speaker: string;
	date: string;
	series: string;
	contentType: AISearchContentType;
	snippet: string;
	match: number;
	redirectTo: string;
}