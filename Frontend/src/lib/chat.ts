import type { ChatHistoryTurn, Message } from '$/types/chat';

// At most this many prior turns are sent as context; matches the server's chat.MAX_HISTORY_TURNS.
export const MAX_HISTORY_TURNS = 6;

// The server rejects the whole request with a 400 when the question or any history turn is longer than this;
// matches the server's chat.MAX_MESSAGE_CHARS and chat.MAX_HISTORY_CHARS.
export const MAX_MESSAGE_CHARS = 1000;
export const MAX_HISTORY_CHARS = 1000;

export function formatDuration(seconds: number) {
	const whole = Math.floor(seconds);
	const m = Math.floor(whole / 60);
	const s = whole % 60;
	return `${m}:${String(s).padStart(2, '0')}`;
}

// The server counts code points (Python len), so cut by code point too: String.slice counts UTF-16 units
// and could split an emoji, leaving a lone surrogate the server can't encode.
function truncate(text: string, maxChars: number) {
	return Array.from(text).slice(0, maxChars).join('');
}

// The greeting message is local UI copy, not a model answer, so it's excluded here.
// A model answer can be longer than the server accepts back as a history turn, and one over-long turn would
// make every follow-up fail until it leaves the window, so each turn is cut to the limit (keeping its start).
export function buildHistory(messages: Message[]): ChatHistoryTurn[] {
	return messages
		.filter(m => m.role === 'user' || m.aiGenerated)
		.map(m => ({
			role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
			content: truncate(m.text, MAX_HISTORY_CHARS),
		}))
		.slice(-MAX_HISTORY_TURNS);
}
