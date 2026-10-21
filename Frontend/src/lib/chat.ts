import type { ChatHistoryTurn, Message } from '$/types/chat';

// At most this many prior turns are sent as context; matches the server's chat.MAX_HISTORY_TURNS.
export const MAX_HISTORY_TURNS = 6;

export function formatDuration(seconds: number) {
	const whole = Math.floor(seconds);
	const m = Math.floor(whole / 60);
	const s = whole % 60;
	return `${m}:${String(s).padStart(2, '0')}`;
}

// The greeting message is local UI copy, not a model answer, so it's excluded here.
export function buildHistory(messages: Message[]): ChatHistoryTurn[] {
	return messages
		.filter(m => m.role === 'user' || m.aiGenerated)
		.map(m => ({
			role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
			content: m.text,
		}))
		.slice(-MAX_HISTORY_TURNS);
}
