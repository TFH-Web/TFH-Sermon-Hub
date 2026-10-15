// @vitest-environment jsdom
import type {
	AccountInfo,
	IPublicClientApplication,
} from '@azure/msal-browser';
import axios, { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	hasStaffRole,
	installApiAuth,
	safeReturnPath,
	selectedAccount,
	useAuth,
} from './auth';

const account = {
	homeAccountId: 'one',
	localAccountId: 'one',
	username: 'staff@example.invalid',
	name: 'Staff Member',
} as AccountInfo;

function fixture(baseURL: string | undefined = 'https://api.example.invalid') {
	const msal = {
		getAllAccounts: vi.fn(() => [account]),
		getActiveAccount: vi.fn((): AccountInfo | null => account),
		acquireTokenSilent: vi.fn(
			async (_request: { account: AccountInfo; scopes: string[] }) => ({
				accessToken: 'api-token',
				idToken: 'never-use-this',
			}),
		),
	};
	const client = axios.create({ baseURL });
	const adapter = vi.fn(async config => ({
		data: {},
		status: 200,
		statusText: 'OK',
		headers: {},
		config,
	}));
	client.defaults.adapter = adapter;
	installApiAuth(client, msal as unknown as IPublicClientApplication, [
		'api://test/access_as_user',
	]);
	return { msal, client, adapter };
}

beforeEach(() =>
	useAuth.setState({
		status: 'ready',
		account,
		roles: ['Admin'],
		message: null,
	}),
);

describe('API authentication', () => {
	it.each([
		'/',
		'',
		undefined,
	])('authenticates with same-origin API base %j', async baseURL => {
		const { client, msal, adapter } = fixture(baseURL);
		// Undefined means Axios has no configured base URL, not the fixture default.
		client.defaults.baseURL = baseURL;
		await client.get('/api/whoami');
		expect(msal.acquireTokenSilent).toHaveBeenCalledWith({
			account,
			scopes: ['api://test/access_as_user'],
		});
		expect(adapter.mock.calls[0][0].headers.Authorization).toBe(
			'Bearer api-token',
		);
	});
	it('resolves a relative per-request base before applying auth', async () => {
		const { client, adapter } = fixture(window.location.origin);
		await client.get('/api/whoami', { baseURL: '/' });
		expect(adapter.mock.calls[0][0].headers.Authorization).toBe(
			'Bearer api-token',
		);
	});
	it('uses API access token and scope, never the ID token', async () => {
		const { client, msal, adapter } = fixture();
		await client.get('/api/sermons');
		expect(msal.acquireTokenSilent).toHaveBeenCalledWith({
			account,
			scopes: ['api://test/access_as_user'],
		});
		expect(adapter.mock.calls[0][0].headers.Authorization).toBe(
			'Bearer api-token',
		);
	});
	it('never falls back to an anonymous request after renewal failure', async () => {
		const { client, msal, adapter } = fixture();
		msal.acquireTokenSilent.mockRejectedValue(
			new Error('interaction_required'),
		);
		await expect(client.get('/api/sermons')).rejects.toThrow(
			'Token renewal failed',
		);
		expect(adapter).not.toHaveBeenCalled();
		expect(useAuth.getState().status).toBe('reauthenticate');
		expect(useAuth.getState().roles).toEqual([]);
	});
	it('rejects missing accounts before sending a request', async () => {
		const { client, msal, adapter } = fixture();
		msal.getAllAccounts.mockReturnValue([]);
		msal.getActiveAccount.mockReturnValue(null);
		await expect(client.get('/api/sermons')).rejects.toThrow(
			'Sign-in required',
		);
		expect(adapter).not.toHaveBeenCalled();
	});
	it('never sends credentials to a different origin', async () => {
		const { client, msal, adapter } = fixture();
		await client.get('https://other.example.invalid/api/sermons');
		expect(msal.acquireTokenSilent).not.toHaveBeenCalled();
		expect(adapter.mock.calls[0][0].headers.Authorization).toBeUndefined();
	});
	it('uses the active account, not the first cached account', async () => {
		const { client, msal } = fixture();
		const other = { ...account, homeAccountId: 'two' };
		msal.getAllAccounts.mockReturnValue([other, account]);
		await client.get('/api/sermons');
		expect(msal.acquireTokenSilent.mock.calls[0][0].account).toBe(account);
		msal.getActiveAccount.mockReturnValue(null);
		expect(
			selectedAccount(msal as unknown as IPublicClientApplication),
		).toBeNull();
	});
	it('discards data returned after the account changes', async () => {
		const { client, msal, adapter } = fixture();
		adapter.mockImplementation(async config => {
			msal.getAllAccounts.mockReturnValue([
				{ ...account, homeAccountId: 'two' },
			]);
			return {
				data: { private: true },
				config,
				status: 200,
				statusText: 'OK',
				headers: {},
			};
		});
		await expect(client.get('/api/sermons')).rejects.toThrow(
			'previous account',
		);
	});
	it.each([
		401, 403,
	])('handles HTTP %i without an interactive redirect loop', async status => {
		const { client, adapter } = fixture();
		adapter.mockImplementation(async config => {
			throw new AxiosError('Denied', 'ERR_BAD_REQUEST', config, undefined, {
				data: {},
				config,
				status,
				statusText: 'Denied',
				headers: {},
			});
		});
		await expect(client.get('/api/sermons')).rejects.toThrow('Denied');
		expect(useAuth.getState().status).toBe(
			status === 401 ? 'reauthenticate' : 'ready',
		);
	});
});

it.each([
	'https://attacker.invalid',
	'//attacker.invalid',
	'/\\attacker.invalid',
	'/login',
	' /sermons',
	'/\n/attacker.invalid',
	null,
])('rejects unsafe return path %j', value => {
	expect(safeReturnPath(value)).toBe('/');
});
it('keeps a local deep link and exact staff roles', () => {
	expect(safeReturnPath('/sermons/12?q=hope#video')).toBe(
		'/sermons/12?q=hope#video',
	);
	for (const role of ['Admin', 'Internal User', 'InternalUser'])
		expect(hasStaffRole([role])).toBe(true);
	expect(hasStaffRole(['NotAdmin', 'admin', 'User'])).toBe(false);
});
