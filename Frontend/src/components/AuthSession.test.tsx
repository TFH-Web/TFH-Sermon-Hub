// @vitest-environment jsdom
import {
	type AccountInfo,
	type EventCallbackFunction,
	EventType,
	InteractionStatus,
	InteractionType,
} from '@azure/msal-browser';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import axios, { AxiosError } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuth } from '$/lib/auth';
import AuthSession from './AuthSession';

const mocks = vi.hoisted(() => ({
	getActiveAccount: vi.fn(),
	setActiveAccount: vi.fn(),
	addEventCallback: vi.fn(),
	removeEventCallback: vi.fn(),
	accounts: [] as AccountInfo[],
}));
vi.mock('@azure/msal-react', () => ({
	useMsal: () => ({
		instance: mocks,
		accounts: mocks.accounts,
		inProgress: InteractionStatus.None,
	}),
}));

const account = {
	homeAccountId: 'one',
	localAccountId: 'one',
	username: 'staff@example.invalid',
} as AccountInfo;
beforeEach(() => {
	vi.resetAllMocks();
	mocks.accounts = [account];
	mocks.getActiveAccount.mockReturnValue(account);
	mocks.setActiveAccount.mockImplementation((selected: AccountInfo) => {
		mocks.getActiveAccount.mockReturnValue(selected);
	});
	useAuth.setState({
		status: 'loading',
		roles: [],
		account: null,
		message: null,
	});
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function session() {
	const client = new QueryClient();
	client.setQueryData(['private'], 'old account data');
	render(
		<QueryClientProvider client={client}>
			<AuthSession>
				<p>App</p>
			</AuthSession>
		</QueryClientProvider>,
	);
	return client;
}

it('uses backend roles and clears cached data before verifying a different identity', async () => {
	vi.spyOn(axios, 'get').mockResolvedValue({
		data: { roles: ['Internal User'] },
	});
	const client = session();
	await waitFor(() => expect(useAuth.getState().status).toBe('ready'));
	expect(useAuth.getState().roles).toEqual(['Internal User']);
	expect(client.getQueryData(['private'])).toBeUndefined();
});
it('reports a valid account without staff access as forbidden', async () => {
	vi.spyOn(axios, 'get').mockRejectedValue(
		new AxiosError('denied', 'ERR_BAD_REQUEST', undefined, undefined, {
			status: 403,
		} as never),
	);
	session();
	await waitFor(() => expect(useAuth.getState().status).toBe('forbidden'));
	expect(useAuth.getState().message).toContain('staff role');
});
it('fails closed on malformed role responses', async () => {
	vi.spyOn(axios, 'get').mockResolvedValue({ data: { roles: 'Admin' } });
	session();
	await waitFor(() => expect(useAuth.getState().status).toBe('forbidden'));
});
it('offers recovery when session verification fails', async () => {
	vi.spyOn(axios, 'get').mockRejectedValue(new Error('network'));
	session();
	await waitFor(() => expect(useAuth.getState().status).toBe('reauthenticate'));
	expect(useAuth.getState().roles).toEqual([]);
});
it('removes identity and permissions on session loss', async () => {
	mocks.accounts = [];
	mocks.getActiveAccount.mockReturnValue(null);
	session();
	await waitFor(() => expect(useAuth.getState().status).toBe('signed-out'));
	expect(useAuth.getState().account).toBeNull();
});
it('rechecks API roles and clears data on an active-account switch', async () => {
	const other = { ...account, homeAccountId: 'two' };
	mocks.accounts = [account, other];
	const get = vi
		.spyOn(axios, 'get')
		.mockResolvedValueOnce({ data: { roles: ['Admin'] } })
		.mockResolvedValueOnce({ data: { roles: ['InternalUser'] } });
	const client = session();
	await waitFor(() => expect(useAuth.getState().status).toBe('ready'));
	client.setQueryData(['private'], 'first account data');
	mocks.getActiveAccount.mockReturnValue(other);
	const onEvent = mocks.addEventCallback.mock
		.calls[0][0] as EventCallbackFunction;
	act(() => onEvent({ eventType: EventType.ACTIVE_ACCOUNT_CHANGED } as never));
	await waitFor(() =>
		expect(useAuth.getState().roles).toEqual(['InternalUser']),
	);
	expect(get).toHaveBeenCalledTimes(2);
	expect(client.getQueryData(['private'])).toBeUndefined();
});

it.each([
	true,
	false,
])('adopts the account chosen by redirect, already cached: %s', async cached => {
	const other = { ...account, homeAccountId: 'two', localAccountId: 'two' };
	mocks.accounts = cached ? [account, other] : [account];
	const get = vi
		.spyOn(axios, 'get')
		.mockResolvedValueOnce({ data: { roles: ['Admin'] } })
		.mockResolvedValueOnce({ data: { roles: ['InternalUser'] } });
	const client = session();
	await waitFor(() => expect(useAuth.getState().status).toBe('ready'));
	client.setQueryData(['private'], 'old account data');
	if (!cached) mocks.accounts = [account, other];
	const onEvent = mocks.addEventCallback.mock
		.calls[0][0] as EventCallbackFunction;
	act(() =>
		onEvent({
			eventType: EventType.ACQUIRE_TOKEN_SUCCESS,
			interactionType: InteractionType.Redirect,
			payload: { account: other },
		} as never),
	);
	await waitFor(() =>
		expect(useAuth.getState().account?.homeAccountId).toBe('two'),
	);
	await waitFor(() => expect(useAuth.getState().status).toBe('ready'));
	expect(mocks.setActiveAccount).toHaveBeenCalledWith(other);
	expect(get).toHaveBeenCalledTimes(2);
	expect(useAuth.getState().roles).toEqual(['InternalUser']);
	expect(client.getQueryData(['private'])).toBeUndefined();
});

it('does not adopt another account from a background silent-token response', async () => {
	const other = { ...account, homeAccountId: 'two' };
	mocks.accounts = [account, other];
	const get = vi
		.spyOn(axios, 'get')
		.mockResolvedValue({ data: { roles: ['Admin'] } });
	session();
	await waitFor(() => expect(useAuth.getState().status).toBe('ready'));
	const onEvent = mocks.addEventCallback.mock
		.calls[0][0] as EventCallbackFunction;
	act(() =>
		onEvent({
			eventType: EventType.ACQUIRE_TOKEN_SUCCESS,
			interactionType: InteractionType.Silent,
			payload: { account: other },
		} as never),
	);
	expect(mocks.setActiveAccount).not.toHaveBeenCalled();
	expect(useAuth.getState().account?.homeAccountId).toBe('one');
	expect(get).toHaveBeenCalledTimes(1);
});
