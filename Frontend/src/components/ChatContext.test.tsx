// @vitest-environment jsdom
import type { AccountInfo } from '@azure/msal-browser';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuth } from '$/lib/auth';
import type { Message } from '$/types/chat';
import { ChatProvider, useChatConversation } from './ChatContext';

function accountWithId(id: string) {
	return {
		homeAccountId: id,
		localAccountId: id,
		username: `${id}@example.invalid`,
	} as AccountInfo;
}
const accountA = accountWithId('A');
const accountB = accountWithId('B');

function userMessage(id: number, text: string): Message {
	return { id, role: 'user', text };
}

beforeEach(() => {
	useAuth.setState({
		status: 'ready',
		account: accountA,
		roles: ['Admin'],
		message: null,
	});
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

// One chat on the general scope, the way /ai-chat without a sermon uses it.
function renderGeneral() {
	return renderHook(() => useChatConversation('general'), {
		wrapper: ChatProvider,
	});
}

// Two scopes sharing one provider: the general chat and a selected sermon's chat.
function renderScopes() {
	return renderHook(
		() => ({
			general: useChatConversation('general'),
			sermon: useChatConversation('42'),
		}),
		{ wrapper: ChatProvider },
	);
}

it('throws when used outside a ChatProvider', () => {
	// React reports the error it rethrows too; keep the test output clean.
	vi.spyOn(console, 'error').mockImplementation(() => {});

	expect(() => renderHook(() => useChatConversation('general'))).toThrow(
		'useChatConversation must be used within a ChatProvider',
	);
});

it('keeps two scope keys independent', () => {
	const { result } = renderScopes();

	act(() =>
		result.current.general.setMessages([userMessage(1, 'about grace')]),
	);

	expect(result.current.general.messages).toEqual([
		userMessage(1, 'about grace'),
	]);
	expect(result.current.sermon.messages).toEqual([]);
});

it('does not let a same-tick update to another scope clobber this one', () => {
	const { result } = renderScopes();

	act(() => {
		result.current.general.setMessages(prev => [
			...prev,
			userMessage(1, 'general question'),
		]);
		result.current.sermon.setMessages(prev => [
			...prev,
			userMessage(2, 'sermon question'),
		]);
	});

	expect(result.current.general.messages).toEqual([
		userMessage(1, 'general question'),
	]);
	expect(result.current.sermon.messages).toEqual([
		userMessage(2, 'sermon question'),
	]);
});

it('resolves a functional update against the latest scope state', () => {
	const { result } = renderGeneral();

	// Both updates run before React re-renders, so the second must build on the first.
	act(() => {
		result.current.setMessages(prev => [...prev, userMessage(1, 'first')]);
		result.current.setMessages(prev => [...prev, userMessage(2, 'second')]);
	});

	expect(result.current.messages.map(message => message.id)).toEqual([1, 2]);
});

it('clears every scope when the signed-in account changes', () => {
	const { result } = renderScopes();
	act(() => {
		result.current.general.setMessages([userMessage(1, 'general question')]);
		result.current.sermon.setMessages([userMessage(2, 'sermon question')]);
	});

	act(() => useAuth.setState({ account: accountB }));

	expect(result.current.general.messages).toEqual([]);
	expect(result.current.sermon.messages).toEqual([]);
});

it("never renders the previous account's messages for the new account", () => {
	// Record what every render saw, so a one-render flash of old messages can't hide behind the final state.
	const renders: { accountId: string | null; count: number }[] = [];
	const { result } = renderHook(
		() => {
			const accountId = useAuth(state => state.account?.homeAccountId ?? null);
			const conversation = useChatConversation('general');
			renders.push({ accountId, count: conversation.messages.length });
			return conversation;
		},
		{ wrapper: ChatProvider },
	);
	act(() => result.current.setMessages([userMessage(1, 'private question')]));

	act(() => useAuth.setState({ account: accountB }));

	// The second account must actually have rendered, or the check below proves nothing.
	expect(renders.some(seen => seen.accountId === 'B')).toBe(true);
	const showedOldMessages = renders.some(
		seen => seen.accountId === 'B' && seen.count > 0,
	);
	expect(showedOldMessages).toBe(false);
});

it('clears every scope on sign-out', () => {
	const { result } = renderGeneral();
	act(() => result.current.setMessages([userMessage(1, 'private question')]));

	act(() => useAuth.setState({ status: 'signed-out', account: null }));

	expect(result.current.messages).toEqual([]);
});

// The account stays the same here, only the session goes bad; 'signed-out' has its own test above.
const lostStatuses = ['reauthenticate', 'forbidden', 'error'] as const;
it.each(
	lostStatuses,
)('clears every scope when the session is lost for the same account (%s)', status => {
	const { result } = renderGeneral();
	act(() => result.current.setMessages([userMessage(1, 'private question')]));

	act(() => useAuth.setState({ status }));

	expect(result.current.messages).toEqual([]);
});

it('keeps the conversation across a transient re-verification', () => {
	const { result } = renderGeneral();
	act(() => result.current.setMessages([userMessage(1, 'still here')]));

	// AuthSession sets 'loading' on every re-verify, then 'ready' again, for the same account.
	act(() => useAuth.setState({ status: 'loading' }));
	expect(result.current.messages).toEqual([userMessage(1, 'still here')]);

	act(() => useAuth.setState({ status: 'ready' }));
	expect(result.current.messages).toEqual([userMessage(1, 'still here')]);
});

it('rejects old scoped setters after an account change', () => {
	const { result } = renderGeneral();
	const oldSetMessages = result.current.setMessages;
	act(() => useAuth.setState({ account: accountB }));
	act(() => oldSetMessages([userMessage(1, 'old account data')]));
	expect(result.current.messages).toEqual([]);
});

it('does not let an older attempt finish or clear a newer same-scope request', () => {
	const { result } = renderGeneral();
	const request = { message: 'A question', sermonId: null, history: [] };
	let first: number | null = null;
	act(() => {
		first = result.current.beginRequest(request);
	});
	const completeFirst = result.current.completeRequest;
	act(() => {
		completeFirst(first as number, { error: 'Try again' });
	});
	let second: number | null = null;
	act(() => {
		second = result.current.beginRequest(request);
	});
	act(() =>
		completeFirst(first as number, {
			answer: {
				answer: 'An obsolete answer',
				ai_generated: true,
				supported: false,
				sources: [],
			},
		}),
	);
	expect(second).not.toBe(first);
	expect(result.current.request.id).toBe(second);
	expect(result.current.request.pending).toBe(true);
	expect(result.current.request.error).toBeNull();
	expect(result.current.messages).toEqual([]);
});
