// Dot color indicates the type of activity
export type ActivityType = 'success' | 'system' | 'error' | 'info';

export interface ActivityItem {
	id: string;
	type: ActivityType;
	text: string; // full activity line e.g. "Someone uploaded "Under Grace""
	boldPart: string; // the part to bold e.g. "Someone"
	time: string;
}
