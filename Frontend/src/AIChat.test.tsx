// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { type ReactNode, StrictMode } from 'react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatProvider } from '$/components/ChatContext';
import { useAuth } from '$/lib/auth';
import { MAX_HISTORY_CHARS, MAX_MESSAGE_CHARS } from '$/lib/chat';
import type { ChatAnswer, ChatRequest, ChatSource } from '$/types/chat';
import AIChat from './AIChat';

// What AIChat hands to mutate(), so a test can play the server's reply or failure.
interface ChatCallbacks {
	onSuccess: (answer: ChatAnswer) => void;
	onError: (error: unknown) => void;
}

// useChatRequest is the network boundary, so it is replaced: no axios or TanStack Query here, only AIChat's own wiring.
const { mutate, chatRequest } = vi.hoisted(() => {
	const mutate =
		vi.fn<(request: ChatRequest, options: ChatCallbacks) => void>();
	return { mutate, chatRequest: { mutate, isPending: false } };
});
vi.mock('$/hooks/useChatRequest', () => ({ default: () => chatRequest }));
// The header and sidebar are not what is under test and pull in MSAL, so only the page body is rendered.
vi.mock('$/components/MainLayout', () => ({
	default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

beforeEach(() => {
	mutate.mockReset();
	chatRequest.isPending = false;
	useAuth.setState({
		status: 'ready',
		account: null,
		roles: [],
		message: null,
	});
});
afterEach(cleanup);

const placeholder =
	'Ask anything about sermons, speakers, topics, or scripture...';
const sermonPath = '/ai-chat?sermonId=7&title=Under+Grace';

// The same video and timestamp as Backend/tests/test_chat_citations.py.
const source: ChatSource = {
	source_id: 1,
	chunk_id: 10,
	sermon_id: 7,
	title: 'Under Grace',
	youtube_video_id: 'JQSUGFQO5FU',
	start_sec: 75,
	end_sec: 90,
	url: 'https://www.youtube.com/watch?v=JQSUGFQO5FU&t=75s',
};
const answer: ChatAnswer = {
	answer: 'Grace is a gift.',
	ai_generated: true,
	supported: true,
	sources: [source],
};
// The server answers "not found" as a normal reply, not as an error.
const decline: ChatAnswer = {
	answer: 'I could not find that in the sermons.',
	ai_generated: true,
	supported: false,
	sources: [],
};

function LocationProbe() {
	return <p data-testid="search">{useLocation().search}</p>;
}

// The links move between the general chat and a sermon's chat without leaving the page, like in-app navigation.
function renderAt(path: string, { strict = false } = {}) {
	const chat = (
		<ChatProvider>
			<MemoryRouter initialEntries={[path]}>
				<nav>
					<Link to="/ai-chat">Go to general chat</Link>
					<Link to={sermonPath}>Go to sermon chat</Link>
				</nav>
				<Routes>
					<Route path="/ai-chat" element={<AIChat />} />
				</Routes>
				<LocationProbe />
			</MemoryRouter>
		</ChatProvider>
	);
	return render(strict ? <StrictMode>{chat}</StrictMode> : chat);
}

async function ask(text: string) {
	await userEvent.type(
		screen.getByPlaceholderText(placeholder),
		`${text}{Enter}`,
	);
}

// Plays the reply to the nth request AIChat sent.
function answerCall(index: number, reply: ChatAnswer) {
	act(() => mutate.mock.calls[index][1].onSuccess(reply));
}

// Plays a failure for the nth request AIChat sent.
function failCall(index: number, error: unknown) {
	act(() => mutate.mock.calls[index][1].onError(error));
}

function apiFailure(message: string) {
	return new AxiosError('failed', 'ERR_BAD_RESPONSE', undefined, undefined, {
		status: 500,
		data: { error: message },
	} as never);
}

it('shows the empty-state prompts on a general chat, and clicking one fills the input', async () => {
	renderAt('/ai-chat');
	expect(screen.getByText('Ask about any sermon')).toBeTruthy();

	await userEvent.click(
		screen.getByRole('button', {
			name: 'What has Dave said about forgiveness?',
		}),
	);

	const input = screen.getByPlaceholderText(placeholder) as HTMLInputElement;
	expect(input.value).toBe('What has Dave said about forgiveness?');
});

it('shows "Searching sermons…" while a request is pending', async () => {
	renderAt(sermonPath);
	await ask('What is grace?');

	expect(screen.getByText('Searching sermons…')).toBeTruthy();
});

it('renders the answer, the "AI generated" label and each cited source', async () => {
	renderAt('/ai-chat');
	await ask('What is grace?');

	answerCall(0, answer);

	expect(screen.getByText('Grace is a gift.')).toBeTruthy();
	expect(screen.getByText('AI generated')).toBeTruthy();
	const link = screen.getByRole('link', { name: /Under Grace/ });
	expect(link.getAttribute('href')).toBe(source.url);
	expect(link.getAttribute('target')).toBe('_blank');
	expect(screen.getByText('1:15–1:30')).toBeTruthy();
});

it('does not label the sermon greeting "AI generated"', () => {
	renderAt(sermonPath);

	expect(screen.getByText(/ready to answer questions about/)).toBeTruthy();
	expect(screen.queryByText('AI generated')).toBeNull();
});

it('renders a supported:false decline as a labeled answer with no source cards and no alert', async () => {
	renderAt('/ai-chat');
	await ask('Where is the moon?');

	answerCall(0, decline);

	expect(screen.getByText(decline.answer)).toBeTruthy();
	expect(screen.getByText('AI generated')).toBeTruthy();
	expect(screen.queryByTitle(/Ask AI about/)).toBeNull();
	expect(screen.queryByRole('alert')).toBeNull();
});

it("shows the server's message in the ErrorBox on failure", async () => {
	renderAt('/ai-chat');
	await ask('What is grace?');

	failCall(0, apiFailure('Chat unavailable'));

	expect(screen.getByRole('alert').textContent).toContain('Chat unavailable');
});

it('falls back to a generic message for a non-API failure', async () => {
	renderAt('/ai-chat');
	await ask('What is grace?');

	failCall(0, new Error('boom'));

	expect(screen.getByRole('alert').textContent).toContain(
		'Could not get an answer. Please try again.',
	);
});

it('Retry resends the identical request, and a successful retry clears the error without duplicating the question', async () => {
	renderAt('/ai-chat');
	await ask('What is grace?');
	failCall(0, apiFailure('Chat unavailable'));

	await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

	expect(mutate).toHaveBeenCalledTimes(2);
	expect(mutate.mock.calls[0][0]).toEqual({
		message: 'What is grace?',
		sermonId: null,
		history: [],
	});
	expect(mutate.mock.calls[1][0]).toBe(mutate.mock.calls[0][0]);
	expect(screen.getAllByText('What is grace?')).toHaveLength(1);

	// The retry works: the answer shows, and the error from the first try must not come back with it.
	answerCall(1, answer);

	expect(screen.getByText('Grace is a gift.')).toBeTruthy();
	expect(screen.queryByRole('alert')).toBeNull();
	expect(screen.getAllByText('What is grace?')).toHaveLength(1);
});

it('starting a new question clears the previous error', async () => {
	renderAt('/ai-chat');
	await ask('First question');
	failCall(0, apiFailure('Chat unavailable'));
	expect(screen.getByRole('alert')).toBeTruthy();

	await ask('Second question');

	expect(screen.queryByRole('alert')).toBeNull();
});

it('ignores Enter while a request is pending', async () => {
	renderAt('/ai-chat');

	await ask('What is grace?');
	await ask('A second question');

	expect(mutate).toHaveBeenCalledOnce();
	expect(screen.queryByText('A second question')).toBeNull();
});

it('sends earlier turns as history but never the greeting', async () => {
	renderAt(sermonPath);
	await ask('What is grace?');
	answerCall(0, answer);

	await ask('Tell me more');

	const request = mutate.mock.calls[1][0];
	expect(request.sermonId).toBe(7);
	expect(request.history).toEqual([
		{ role: 'user', content: 'What is grace?' },
		{ role: 'assistant', content: 'Grace is a gift.' },
	]);
});

// The server rejects a question over its limit and Retry would resend the same one, so the input stops it.
it("caps the chat input at the server's message limit", () => {
	renderAt('/ai-chat');

	const input = screen.getByPlaceholderText(placeholder) as HTMLInputElement;
	expect(input.maxLength).toBe(MAX_MESSAGE_CHARS);
});

// An answer can be longer than the server accepts as a history turn, which would fail every follow-up.
it('cuts a long earlier answer to the history limit in the next request', async () => {
	renderAt('/ai-chat');
	await ask('What is grace?');
	answerCall(0, { ...answer, answer: 'a'.repeat(1500) });

	await ask('Tell me more');

	const { history } = mutate.mock.calls[1][0];
	expect(history[1].content).toBe('a'.repeat(MAX_HISTORY_CHARS));
});

it('"ask about this sermon" navigates with only sermonId and title', async () => {
	renderAt('/ai-chat');
	await ask('What is grace?');
	answerCall(0, answer);

	await userEvent.click(screen.getByTitle('Ask AI about "Under Grace"'));

	expect(screen.getByTestId('search').textContent).toBe(
		'?sermonId=7&title=Under+Grace',
	);
	expect(screen.getByText(/ready to answer questions about/)).toBeTruthy();
});

it('resumes each scope when switching back, without a second greeting', async () => {
	renderAt('/ai-chat');
	await ask('What is grace?');
	answerCall(0, answer);

	// Into the sermon's chat: its own greeting, none of the general answer.
	await userEvent.click(
		screen.getByRole('link', { name: 'Go to sermon chat' }),
	);
	expect(screen.getAllByText(/ready to answer questions about/)).toHaveLength(
		1,
	);
	expect(screen.queryByText('Grace is a gift.')).toBeNull();

	// Back to the general chat: the earlier question and answer are still there.
	await userEvent.click(
		screen.getByRole('link', { name: 'Go to general chat' }),
	);
	expect(screen.getByText('Grace is a gift.')).toBeTruthy();
	expect(screen.queryByText(/ready to answer questions about/)).toBeNull();

	// Into the sermon's chat again: resumed, not greeted a second time.
	await userEvent.click(
		screen.getByRole('link', { name: 'Go to sermon chat' }),
	);
	expect(screen.getAllByText(/ready to answer questions about/)).toHaveLength(
		1,
	);
});

it('seeds exactly one greeting under StrictMode', () => {
	// StrictMode runs the greeting effect twice on mount.
	renderAt(sermonPath, { strict: true });

	expect(screen.getAllByText(/ready to answer questions about/)).toHaveLength(
		1,
	);
});
