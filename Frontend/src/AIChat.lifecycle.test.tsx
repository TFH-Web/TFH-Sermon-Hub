// @vitest-environment jsdom
import type { AccountInfo } from '@azure/msal-browser';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ReactNode } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatProvider } from '$/components/ChatContext';
import { useAuth } from '$/lib/auth';
import type { ChatAnswer, ChatRequest } from '$/types/chat';
import AIChat from './AIChat';

// Only the unrelated shell is omitted. ChatProvider, useChatRequest, TanStack
// mutations, response validation and Axios all run unchanged against this adapter.
vi.mock('$/components/MainLayout', () => ({
	default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const placeholder =
	'Ask anything about sermons, speakers, topics, or scripture...';
const accountA = { homeAccountId: 'account-A' } as AccountInfo;
const accountB = { homeAccountId: 'account-B' } as AccountInfo;
const originalAdapter = axios.defaults.adapter;
const clients: QueryClient[] = [];

interface PendingRequest {
	body: ChatRequest;
	answer: (text: string) => void;
	fail: (message: string) => void;
}
let pending: PendingRequest[];

beforeEach(() => {
	pending = [];
	useAuth.setState({
		status: 'ready',
		account: accountA,
		roles: ['Admin'],
		message: null,
	});
	axios.defaults.adapter = config => {
		if (config.method !== 'post' || config.url !== '/api/chat')
			throw new Error(
				`Unexpected test HTTP request: ${config.method} ${config.url}`,
			);
		return new Promise((resolve, reject) => {
			const response = (status: number, data: unknown) => ({
				config,
				data,
				status,
				statusText: String(status),
				headers: {},
			});
			pending.push({
				body: JSON.parse(config.data),
				answer: text =>
					resolve(
						response(200, {
							answer: text,
							ai_generated: true,
							supported: false,
							sources: [],
						} satisfies ChatAnswer),
					),
				fail: message =>
					reject(
						new AxiosError(
							'Unavailable',
							'ERR_BAD_RESPONSE',
							config as InternalAxiosRequestConfig,
							undefined,
							response(503, { error: message, message }),
						),
					),
			});
		});
	};
});

afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
	axios.defaults.adapter = originalAdapter;
});

function SessionGate({ children }: { children: ReactNode }) {
	const status = useAuth(state => state.status);
	return status === 'ready' ? children : <p>Session unavailable</p>;
}

function showChat() {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false, gcTime: 0 },
			mutations: { retry: false, gcTime: 0 },
		},
	});
	clients.push(client);
	return render(
		<QueryClientProvider client={client}>
			<ChatProvider>
				<MemoryRouter initialEntries={['/ai-chat']}>
					<nav>
						<Link to="/ai-chat">General chat</Link>
						<Link to="/ai-chat?sermonId=7&title=Under+Grace">Sermon chat</Link>
						<Link to="/away">Other page</Link>
					</nav>
					<SessionGate>
						<Routes>
							<Route path="/ai-chat" element={<AIChat />} />
							<Route path="/away" element={<p>Another page</p>} />
						</Routes>
					</SessionGate>
				</MemoryRouter>
			</ChatProvider>
		</QueryClientProvider>,
	);
}

async function ask(text: string, count: number) {
	fireEvent.change(screen.getByPlaceholderText(placeholder), {
		target: { value: text },
	});
	fireEvent.keyDown(screen.getByPlaceholderText(placeholder), { key: 'Enter' });
	await waitFor(() => expect(pending).toHaveLength(count));
}

function go(name: string) {
	fireEvent.click(screen.getByRole('link', { name }));
}

async function answer(index: number, text: string) {
	await act(async () => pending[index].answer(text));
}

async function fail(index: number, text: string) {
	await act(async () => pending[index].fail(text));
}

it('keeps a pending request and its eventual answer across route unmount/remount', async () => {
	showChat();
	await ask('What is grace?', 1);
	go('Other page');
	go('General chat');
	expect(screen.getByText('Searching sermons…')).toBeTruthy();
	// The remounted route must not start a second same-scope request.
	fireEvent.change(screen.getByPlaceholderText(placeholder), {
		target: { value: 'Duplicate request' },
	});
	fireEvent.keyDown(screen.getByPlaceholderText(placeholder), { key: 'Enter' });
	expect(pending).toHaveLength(1);
	expect(screen.queryByText('Duplicate request')).toBeNull();
	await answer(0, 'Grace is freely given.');
	await screen.findByText('Grace is freely given.');
	expect(screen.getAllByText('What is grace?')).toHaveLength(1);
	expect(screen.queryByText('Searching sermons…')).toBeNull();
});

it('stores an answer that finishes while another route is open', async () => {
	showChat();
	await ask('What is grace?', 1);
	go('Other page');
	await answer(0, 'An answer while away.');
	go('General chat');
	await screen.findByText('An answer while away.');
	expect(screen.getByText('AI generated')).toBeTruthy();
});

it('retains a failure and retries the identical request after navigation without duplicating the question', async () => {
	showChat();
	await ask('What is grace?', 1);
	go('Other page');
	await fail(0, 'The provider is temporarily unavailable.');
	go('General chat');
	await screen.findByRole('alert');
	go('Other page');
	go('General chat');
	fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
	await waitFor(() => expect(pending).toHaveLength(2));
	expect(pending[1].body).toEqual(pending[0].body);
	expect(screen.getAllByText('What is grace?')).toHaveLength(1);
	await answer(1, 'The retry succeeded.');
	await screen.findByText('The retry succeeded.');
	expect(screen.queryByRole('alert')).toBeNull();
});

it('keeps an old scope failure out of the current scope and offers a working Retry on return', async () => {
	showChat();
	await ask('General question', 1);
	go('Sermon chat');
	await fail(0, 'General scope failed.');
	expect(screen.queryByRole('alert')).toBeNull();
	expect(screen.queryByText('Searching sermons…')).toBeNull();
	go('General chat');
	await screen.findByRole('alert');
	fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
	await waitFor(() => expect(pending).toHaveLength(2));
	expect(pending[1].body).toEqual(pending[0].body);
	await answer(1, 'General scope recovered.');
	await screen.findByText('General scope recovered.');
});

it('allows independent scopes and delivers out-of-order replies only to their original conversations', async () => {
	showChat();
	await ask('General question', 1);
	go('Sermon chat');
	await ask('Sermon question', 2);
	expect(pending[0].body.sermonId).toBeNull();
	expect(pending[1].body.sermonId).toBe(7);
	await answer(0, 'General answer');
	expect(screen.queryByText('General answer')).toBeNull();
	expect(screen.getByText('Searching sermons…')).toBeTruthy();
	await answer(1, 'Sermon answer');
	await screen.findByText('Sermon answer');
	go('General chat');
	await screen.findByText('General answer');
	expect(screen.queryByText('Sermon answer')).toBeNull();
});

it.each([
	'answer',
	'failure',
] as const)('ignores an old account %s without changing a new account pending request', async outcome => {
	showChat();
	await ask('Private account A question', 1);
	act(() => useAuth.setState({ account: accountB }));
	expect(screen.queryByText('Private account A question')).toBeNull();
	await ask('Account B question', 2);
	if (outcome === 'answer') await answer(0, 'Private account A answer');
	else await fail(0, 'Private account A error');
	expect(screen.queryByText('Private account A answer')).toBeNull();
	expect(screen.queryByRole('alert')).toBeNull();
	expect(screen.getByText('Searching sermons…')).toBeTruthy();
	await answer(1, 'Account B answer');
	await screen.findByText('Account B answer');
});

it.each([
	{ status: 'signed-out', outcome: 'answer' },
	{ status: 'signed-out', outcome: 'failure' },
	{ status: 'reauthenticate', outcome: 'answer' },
	{ status: 'reauthenticate', outcome: 'failure' },
] as const)('discards an old $outcome after $status even when the same account signs in again', async ({
	status,
	outcome,
}) => {
	showChat();
	await ask('An old session question', 1);
	act(() => useAuth.setState({ status }));
	expect(screen.getByText('Session unavailable')).toBeTruthy();
	act(() => useAuth.setState({ status: 'ready' }));
	expect(screen.queryByText('An old session question')).toBeNull();
	await ask('New session question', 2);
	if (outcome === 'answer') await answer(0, 'An old session answer');
	else await fail(0, 'An old session error');
	expect(screen.queryByText('An old session answer')).toBeNull();
	expect(screen.queryByRole('alert')).toBeNull();
	expect(screen.getByText('Searching sermons…')).toBeTruthy();
	await answer(1, 'New session answer');
	await screen.findByText('New session answer');
});

it('preserves pending work across transient same-account session verification', async () => {
	showChat();
	await ask('A still valid question', 1);
	act(() => useAuth.setState({ status: 'loading' }));
	await answer(0, 'A still valid answer');
	act(() => useAuth.setState({ status: 'ready' }));
	await screen.findByText('A still valid answer');
});

it('starts with an empty conversation after the provider is remounted like a refresh', async () => {
	const previous = showChat();
	await ask('An old page question', 1);
	previous.unmount();
	showChat();
	await answer(0, 'An old page answer');
	expect(screen.getByText('Ask about any sermon')).toBeTruthy();
	expect(screen.queryByText('An old page question')).toBeNull();
	expect(screen.queryByText('An old page answer')).toBeNull();
});
