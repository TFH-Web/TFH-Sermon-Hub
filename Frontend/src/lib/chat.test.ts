import { describe, expect, test } from 'vitest';
import type { Message } from '$/types/chat';
import {
	buildHistory,
	formatDuration,
	MAX_HISTORY_CHARS,
	MAX_HISTORY_TURNS,
	MAX_MESSAGE_CHARS,
} from './chat';

// Small builders for the two kinds of message the chat stores.
function userMessage(id: number, text: string): Message {
	return { id, role: 'user', text };
}

function answerMessage(id: number, text: string): Message {
	return { id, role: 'ai', text, aiGenerated: true, sources: [] };
}

// The sermon greeting is shown as an AI message but is local copy, not a model answer.
const greeting: Message = {
	id: 1,
	role: 'ai',
	text: "I'm ready to answer questions about Under Grace.",
	aiGenerated: false,
	sources: [],
};

describe('formatDuration', () => {
	// Source cards show a start and end time such as 1:15.
	test('formats whole seconds as m:ss', () => {
		expect(formatDuration(75)).toBe('1:15');
	});

	// A decimal timestamp must drop its fraction, not carry it into the next second.
	test('truncates a fractional second instead of carrying it', () => {
		expect(formatDuration(75.9)).toBe('1:15');
	});

	// Seconds below ten keep their leading zero.
	test('pads single-digit seconds', () => {
		expect(formatDuration(65)).toBe('1:05');
	});

	// The first minute reads as 0:ss.
	test('formats under a minute and zero', () => {
		expect(formatDuration(42)).toBe('0:42');
		expect(formatDuration(0)).toBe('0:00');
	});
});

describe('buildHistory', () => {
	// The API only knows the roles user and assistant.
	test('maps user to user and ai to assistant', () => {
		const history = buildHistory([
			userMessage(2, 'What is grace?'),
			answerMessage(3, 'Grace is a gift.'),
		]);

		expect(history).toEqual([
			{ role: 'user', content: 'What is grace?' },
			{ role: 'assistant', content: 'Grace is a gift.' },
		]);
	});

	// The greeting was never said by the model, so it must not be sent back as context.
	test('leaves out an ai message that is not AI generated (the greeting)', () => {
		const history = buildHistory([greeting, userMessage(2, 'What is grace?')]);

		expect(history).toEqual([{ role: 'user', content: 'What is grace?' }]);
	});

	// Only the latest turns are sent, and they stay in conversation order.
	test('keeps only the last MAX_HISTORY_TURNS turns, oldest first', () => {
		const messages = Array.from({ length: 8 }, (_, i) =>
			i % 2 === 0
				? userMessage(i + 1, `message ${i + 1}`)
				: answerMessage(i + 1, `message ${i + 1}`),
		);

		const history = buildHistory(messages);

		expect(history.map(turn => turn.content)).toEqual([
			'message 3',
			'message 4',
			'message 5',
			'message 6',
			'message 7',
			'message 8',
		]);
	});

	// A new conversation has nothing to send yet.
	test('returns an empty history for no messages', () => {
		expect(buildHistory([])).toEqual([]);
	});

	// A long answer would otherwise make the server reject every follow-up with a 400.
	test('cuts a turn longer than MAX_HISTORY_CHARS, keeping its start', () => {
		const long = `${'a'.repeat(MAX_HISTORY_CHARS)}${'b'.repeat(500)}`;

		const [turn] = buildHistory([answerMessage(2, long)]);

		expect(turn.content).toBe('a'.repeat(MAX_HISTORY_CHARS));
	});

	// A turn right at the limit is accepted by the server, so it must go through whole.
	test('leaves a turn of exactly MAX_HISTORY_CHARS untouched', () => {
		const exact = 'a'.repeat(MAX_HISTORY_CHARS);

		const [turn] = buildHistory([userMessage(2, exact)]);

		expect(turn.content).toBe(exact);
	});

	// The server counts code points, and cutting mid-emoji would send a lone surrogate it can't encode.
	test('counts characters like the server, never splitting an emoji', () => {
		const [turn] = buildHistory([answerMessage(2, '😀'.repeat(1200))]);

		expect(turn.content).toBe('😀'.repeat(MAX_HISTORY_CHARS));
	});

	// The server rejects longer histories, so the two limits must stay equal (Backend/tsh/chat.py).
	test('MAX_HISTORY_TURNS matches the server cap', () => {
		expect(MAX_HISTORY_TURNS).toBe(6);
	});

	// Same for the per-turn and question lengths (Backend/tsh/chat.py).
	test('MAX_HISTORY_CHARS and MAX_MESSAGE_CHARS match the server caps', () => {
		expect(MAX_HISTORY_CHARS).toBe(1000);
		expect(MAX_MESSAGE_CHARS).toBe(1000);
	});
});
