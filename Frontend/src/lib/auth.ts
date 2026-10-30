import type {
	AccountInfo,
	IPublicClientApplication,
} from '@azure/msal-browser';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { create } from 'zustand';

type AuthStatus =
	| 'loading'
	| 'signed-out'
	| 'ready'
	| 'reauthenticate'
	| 'forbidden'
	| 'error';
export const isAuthTestMode =
	import.meta.env.DEV && import.meta.env.VITE_E2E_TEST === 'true';
export const useAuth = create<{
	status: AuthStatus;
	account: AccountInfo | null;
	roles: string[];
	message: string | null;
}>(() => {
	// Normal development and production still require real authentication.
	if (!isAuthTestMode) {
		return {
			status: 'loading',
			account: null,
			roles: [],
			message: null,
		};
	}

	// Browser tests can select a role; existing feature tests default to Admin.
	const role = window.sessionStorage.getItem('tfh-e2e-role') ?? 'Admin';
	const roles =
		role === 'Admin'
			? ['Admin']
			: role === 'InternalUser'
				? ['InternalUser']
				: [];

	return {
		status: roles.length > 0 ? 'ready' : 'forbidden',
		account: null,
		roles,
		message:
			roles.length > 0
				? null
				: 'This account has no Sermon Hub staff role. Ask an administrator for access.',
	};
});

export function selectedAccount(
	instance: IPublicClientApplication,
	accounts = instance.getAllAccounts(),
): AccountInfo | null {
	const active = instance.getActiveAccount();
	return (
		accounts.find(account => account.homeAccountId === active?.homeAccountId) ??
		(accounts.length === 1 ? accounts[0] : null)
	);
}

export function safeReturnPath(value: unknown): string {
	if (
		typeof value !== 'string' ||
		!value.startsWith('/') ||
		value.startsWith('//') ||
		/[\\\s]/.test(value) ||
		Array.from(value).some(character => character.charCodeAt(0) < 32) ||
		value.split(/[?#]/)[0] === '/login'
	)
		return '/';
	return value;
}

export function hasStaffRole(roles: string[]): boolean {
	return roles.some(role =>
		['Admin', 'Internal User', 'InternalUser'].includes(role),
	);
}

export function useIsAdmin(): boolean {
	const allowed = useAuth(
		state => state.status === 'ready' && state.roles.includes('Admin'),
	);
	// Test identities use the same Admin permission check as real identities.
	return allowed;
}

export function installApiAuth(
	client: AxiosInstance,
	instance: IPublicClientApplication,
	scopes: string[],
) {
	const requestAccounts = new WeakMap<InternalAxiosRequestConfig, string>();
	const rejectSession = (status: AuthStatus, message: string) => {
		useAuth.setState({ status, roles: [], message });
	};
	const requestId = client.interceptors.request.use(async config => {
		const origin = new URL(
			client.defaults.baseURL || '/',
			window.location.origin,
		);
		const target = new URL(client.getUri(config), window.location.origin);
		if (target.origin !== origin.origin || !target.pathname.startsWith('/api/'))
			return config;
		if (isAuthTestMode) return config;
		const account = selectedAccount(instance);
		if (!account) {
			rejectSession(
				'reauthenticate',
				'Please sign in with your staff account.',
			);
			throw new Error('Sign-in required');
		}
		if (scopes.length === 0) {
			rejectSession(
				'error',
				'API access is not configured. Contact the application administrator.',
			);
			throw new Error('Missing VITE_API_SCOPE');
		}
		let accessToken: string;
		try {
			({ accessToken } = await instance.acquireTokenSilent({
				account,
				scopes,
			}));
		} catch {
			if (selectedAccount(instance)?.homeAccountId === account.homeAccountId)
				rejectSession(
					'reauthenticate',
					'Your session could not be renewed. Please sign in again.',
				);
			throw new Error('Token renewal failed');
		}
		if (
			!accessToken &&
			selectedAccount(instance)?.homeAccountId === account.homeAccountId
		) {
			rejectSession(
				'reauthenticate',
				'Microsoft returned no API access token. Please sign in again.',
			);
		}
		if (
			!accessToken ||
			selectedAccount(instance)?.homeAccountId !== account.homeAccountId
		) {
			throw new Error('Account changed or no API access token was returned');
		}
		config.headers.Authorization = `Bearer ${accessToken}`;
		requestAccounts.set(config, account.homeAccountId);
		return config;
	});
	const responseId = client.interceptors.response.use(
		response => {
			const accountId = requestAccounts.get(response.config);
			if (accountId && selectedAccount(instance)?.homeAccountId !== accountId) {
				throw new Error('Discarded response from a previous account');
			}
			return response;
		},
		error => {
			const accountId = error.config && requestAccounts.get(error.config);
			if (
				accountId &&
				selectedAccount(instance)?.homeAccountId === accountId &&
				error.response?.status === 401
			) {
				rejectSession(
					'reauthenticate',
					'Your session is no longer valid. Please sign in again.',
				);
			}
			// A forbidden Admin action must not log an authorized read-only user out.
			return Promise.reject(error);
		},
	);
	return () => {
		client.interceptors.request.eject(requestId);
		client.interceptors.response.eject(responseId);
	};
}
