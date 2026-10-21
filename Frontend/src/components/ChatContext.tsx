import type React from 'react';
import { createContext, useContext, useState } from 'react';
import { useAuth } from '$/lib/auth';
import type { Message } from '$/types/chat';

let msgIdCounter = 0;
export function nextId() {
	return ++msgIdCounter;
}

interface ChatContextValue {
	conversations: Record<string, Message[]>;
	setConversations: React.Dispatch<
		React.SetStateAction<Record<string, Message[]>>
	>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// Holds every scope's conversation above the route lifecycle, so navigating within the app doesn't lose it.
// Nothing here touches localStorage/sessionStorage, so a refresh still clears it for free.
export function ChatProvider({ children }: { children: React.ReactNode }) {
	const [conversations, setConversations] = useState<
		Record<string, Message[]>
	>({});

	// Mirrors AuthSession's queryClient.clear() rule: drop every conversation when the account changes
	// or the session is lost, even without a full page reload. useAuth is read instead of useUser() because
	// useUser() is null during every transient 'loading' re-verify, which must not wipe the chat.
	const accountId = useAuth(state => state.account?.homeAccountId ?? null);
	const sessionLost = useAuth(
		state => state.status !== 'ready' && state.status !== 'loading',
	);
	const [owner, setOwner] = useState(accountId);
	// Adjusted while rendering instead of in an effect, so a new account never paints the previous one's messages.
	if (owner !== accountId) {
		setOwner(accountId);
		setConversations({});
	} else if (sessionLost && Object.keys(conversations).length > 0) {
		setConversations({});
	}

	return (
		<ChatContext.Provider value={{ conversations, setConversations }}>
			{children}
		</ChatContext.Provider>
	);
}

/** Read/write one scope's conversation, keyed by e.g. the selected sermon id or 'general'. Same shape as useState's return. */
export function useChatConversation(key: string): {
	messages: Message[];
	setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
} {
	const context = useContext(ChatContext);
	if (!context) {
		throw new Error('useChatConversation must be used within a ChatProvider');
	}

	const { conversations, setConversations } = context;
	const messages = conversations[key] ?? [];

	// A function update is resolved against this scope's latest state, not the messages from the last render,
	// so two scopes updating in the same tick can't clobber each other.
	function setMessages(update: React.SetStateAction<Message[]>) {
		setConversations(prev => ({
			...prev,
			[key]:
				typeof update === 'function'
					? (update as (previous: Message[]) => Message[])(prev[key] ?? [])
					: update,
		}));
	}

	return { messages, setMessages };
}
