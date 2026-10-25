import type React from 'react';
import { createContext, useContext, useRef, useState } from 'react';
import { useAuth } from '$/lib/auth';
import type { ChatAnswer, ChatRequest, Message } from '$/types/chat';

let msgIdCounter = 0;
export function nextId() {
	return ++msgIdCounter;
}

interface RequestState {
	id: number | null;
	pending: boolean;
	error: string | null;
	lastRequest: ChatRequest | null;
}

interface Conversation {
	messages: Message[];
	request: RequestState;
}

const EMPTY_CONVERSATION: Conversation = {
	messages: [],
	request: { id: null, pending: false, error: null, lastRequest: null },
};

interface ChatContextValue {
	conversations: Record<string, Conversation>;
	generation: number;
	update: (
		key: string,
		generation: number,
		change: (previous: Conversation) => Conversation,
	) => boolean;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// Holds every scope's conversation above the route lifecycle, so navigating within the app doesn't lose it.
// Nothing here touches localStorage/sessionStorage, so a refresh still clears it for free.
export function ChatProvider({ children }: { children: React.ReactNode }) {
	const [conversations, setConversations] = useState<
		Record<string, Conversation>
	>({});
	// Resolve same-tick updates synchronously so a remounted route or a double
	// submission cannot claim a second pending request in the same scope.
	const latest = useRef(conversations);

	// Mirrors AuthSession's queryClient.clear() rule: drop every conversation when the account changes
	// or the session is lost, even without a full page reload. useAuth is read instead of useUser() because
	// useUser() is null during every transient 'loading' re-verify, which must not wipe the chat.
	const accountId = useAuth(state => state.account?.homeAccountId ?? null);
	const sessionLost = useAuth(
		state => state.status !== 'ready' && state.status !== 'loading',
	);
	const session = useRef({ accountId, lost: sessionLost, generation: 0 });
	// Adjusted while rendering instead of in an effect, so a new account never paints the previous one's messages.
	if (
		session.current.accountId !== accountId ||
		(sessionLost && !session.current.lost)
	) {
		session.current = {
			accountId,
			lost: sessionLost,
			generation: session.current.generation + 1,
		};
		latest.current = {};
		if (Object.keys(conversations).length > 0) setConversations({});
	} else {
		session.current.lost = sessionLost;
	}

	function update(
		key: string,
		generation: number,
		change: (previous: Conversation) => Conversation,
	) {
		// Network callbacks retain the scope/session that started their request.
		// A late reply after sign-out/account change must never repopulate new state.
		if (session.current.lost || generation !== session.current.generation)
			return false;
		const previous = latest.current[key] ?? EMPTY_CONVERSATION;
		const next = change(previous);
		if (next === previous) return false;
		latest.current = { ...latest.current, [key]: next };
		setConversations(latest.current);
		return true;
	}

	return (
		<ChatContext.Provider
			value={{ conversations, generation: session.current.generation, update }}
		>
			{children}
		</ChatContext.Provider>
	);
}

/** Read/write one scope's conversation, keyed by e.g. the selected sermon id or 'general'. Same shape as useState's return. */
export function useChatConversation(key: string): {
	messages: Message[];
	setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
	request: RequestState;
	beginRequest: (request: ChatRequest) => number | null;
	completeRequest: (
		id: number,
		outcome: { answer: ChatAnswer } | { error: string },
	) => void;
} {
	const context = useContext(ChatContext);
	if (!context) {
		throw new Error('useChatConversation must be used within a ChatProvider');
	}

	const { conversations, generation, update: updateConversation } = context;
	const conversation = conversations[key] ?? EMPTY_CONVERSATION;

	// A function update is resolved against this scope's latest state, not the messages from the last render,
	// so two scopes updating in the same tick can't clobber each other.
	function setMessages(update: React.SetStateAction<Message[]>) {
		updateConversation(key, generation, previous => ({
			...previous,
			messages:
				typeof update === 'function' ? update(previous.messages) : update,
		}));
	}

	function beginRequest(request: ChatRequest) {
		const id = nextId();
		const started = updateConversation(key, generation, previous =>
			previous.request.pending
				? previous
				: {
						...previous,
						request: { id, pending: true, error: null, lastRequest: request },
					},
		);
		return started ? id : null;
	}

	function completeRequest(
		id: number,
		outcome: { answer: ChatAnswer } | { error: string },
	) {
		updateConversation(key, generation, previous => {
			if (!previous.request.pending || previous.request.id !== id)
				return previous;
			return {
				messages:
					'answer' in outcome
						? [
								...previous.messages,
								{
									id: nextId(),
									role: 'ai',
									text: outcome.answer.answer,
									aiGenerated: outcome.answer.ai_generated,
									sources: outcome.answer.sources,
								},
							]
						: previous.messages,
				request: {
					...previous.request,
					pending: false,
					error: 'error' in outcome ? outcome.error : null,
				},
			};
		});
	}

	return {
		messages: conversation.messages,
		setMessages,
		request: conversation.request,
		beginRequest,
		completeRequest,
	};
}
