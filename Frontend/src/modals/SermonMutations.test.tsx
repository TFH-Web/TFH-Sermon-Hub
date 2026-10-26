// @vitest-environment jsdom
import type {
	AccountInfo,
	IPublicClientApplication,
} from '@azure/msal-browser';
import {
	QueryClient,
	QueryClientProvider,
	QueryObserver,
} from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios, { type AxiosAdapter, AxiosError } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installApiAuth, useAuth } from '$/lib/auth';
import type { Sermon } from '$/types/sermon';
import DeleteSermonModal from './DeleteSermonModal';
import EditSermonModal from './EditSermonModal';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('$/components/ToastContext', () => ({
	useToast: () => ({ showToast }),
}));

const activeAccount = {
	homeAccountId: 'selected-admin',
	localAccountId: 'selected-admin',
	username: 'admin@example.invalid',
} as AccountInfo;
const otherAccount = {
	...activeAccount,
	homeAccountId: 'first-cached-account',
};
const scopes = ['api://sermon-hub/access_as_user'];
const msal = {
	getAllAccounts: vi.fn(() => [otherAccount, activeAccount]),
	getActiveAccount: vi.fn(() => activeAccount),
	acquireTokenSilent: vi.fn(async () => ({
		accessToken: 'selected-api-token',
	})),
};
const sermon: Sermon = {
	id: 12,
	title: 'Hope',
	videoLink: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	duration: 60,
	date: new Date('2026-10-15T12:00:00'),
	description: 'A sermon about hope',
	tags: [{ name: 'hope', source: 'manual' }],
	speaker: { id: 1, firstName: 'Dave', lastName: 'Patterson' },
	status: 'Published',
};
const originalAdapter = axios.defaults.adapter;
const originalBaseURL = axios.defaults.baseURL;
let removeAuth: () => void;
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>;
const queryCleanups: Array<() => void> = [];

beforeEach(() => {
	vi.clearAllMocks();
	msal.acquireTokenSilent
		.mockReset()
		.mockResolvedValue({ accessToken: 'selected-api-token' });
	adapter = vi.fn<AxiosAdapter>(async config => ({
		data: {},
		status: 200,
		statusText: 'OK',
		headers: {},
		config,
	}));
	axios.defaults.baseURL = 'https://api.example.invalid';
	axios.defaults.adapter = adapter;
	removeAuth = installApiAuth(
		axios,
		msal as unknown as IPublicClientApplication,
		scopes,
	);
	useAuth.setState({
		status: 'ready',
		account: activeAccount,
		roles: ['Admin'],
		message: null,
	});
});

afterEach(() => {
	cleanup();
	for (const dispose of queryCleanups.splice(0).reverse()) dispose();
	removeAuth();
	axios.defaults.adapter = originalAdapter;
	axios.defaults.baseURL = originalBaseURL;
	vi.restoreAllMocks();
});

function createQueryClient() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: Infinity } },
	});
	queryCleanups.push(() => client.clear());
	return client;
}

function modal(kind: 'edit' | 'delete', client = createQueryClient()) {
	const onClose = vi.fn();
	render(
		<QueryClientProvider client={client}>
			<MemoryRouter initialEntries={['/']}>
				<Routes>
					<Route
						path="/"
						element={
							kind === 'edit' ? (
								<EditSermonModal isOpen onClose={onClose} sermon={sermon} />
							) : (
								<DeleteSermonModal isOpen onClose={onClose} sermon={sermon} />
							)
						}
					/>
					<Route path="/sermons" element={<p>Sermon list</p>} />
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);
	return {
		onClose,
		submit: () =>
			userEvent.click(
				screen.getByRole('button', {
					name: kind === 'edit' ? 'Save Changes' : 'Delete Sermon',
				}),
			),
	};
}

function observedCaches() {
	const client = createQueryClient();
	const sharedKeys = [
		['sermons', 'dashboard', { page: 1, pageSize: 5, sort: 'Newest' }],
		['speakers', 'count'],
		['series', 'count'],
		['sermons'],
		['paginated-sermons', { page: 2 }],
		['import-sermons', 'Published', 1],
		['paginated-speakers', { page: 2 }],
	] as const;
	const observe = (queryKey: readonly unknown[]) => {
		const original = { version: 1 };
		const updated = { version: 2 };
		client.setQueryData(queryKey, original);
		const refetch = vi.fn(async () => updated);
		const observer = new QueryObserver(client, { queryKey, queryFn: refetch });
		const unsubscribe = observer.subscribe(() => {});
		queryCleanups.push(() => {
			unsubscribe();
			observer.destroy();
		});
		return { queryKey, refetch, original, updated };
	};
	return {
		client,
		shared: sharedKeys.map(observe),
		detail: observe(['sermon', String(sermon.id)]),
		unrelated: observe(['unrelated', 'dashboard']),
	};
}

it.each([
	'edit',
	'delete',
] as const)('%s refreshes nested dashboard counts and sermon-list caches only after success', async kind => {
	const { client, shared, detail, unrelated } = observedCaches();
	const { onClose, submit } = modal(kind, client);
	await submit();
	await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	for (const entry of shared) {
		expect(entry.refetch).toHaveBeenCalledOnce();
		expect(client.getQueryData(entry.queryKey)).toEqual(entry.updated);
	}
	if (kind === 'edit') {
		expect(detail.refetch).toHaveBeenCalledOnce();
		expect(client.getQueryData(detail.queryKey)).toEqual(detail.updated);
	} else {
		expect(detail.refetch).not.toHaveBeenCalled();
		expect(client.getQueryData(detail.queryKey)).toEqual(detail.original);
	}
	expect(unrelated.refetch).not.toHaveBeenCalled();
	expect(client.getQueryData(unrelated.queryKey)).toEqual(unrelated.original);
});

it.each([
	'edit',
	'delete',
] as const)('%s does not invalidate dashboard or list caches when the API rejects the change', async kind => {
	adapter.mockImplementationOnce(async config => {
		throw new AxiosError('Denied', 'ERR_BAD_REQUEST', config, undefined, {
			data: { error: 'This change was rejected.' },
			config,
			status: 403,
			statusText: 'Forbidden',
			headers: {},
		});
	});
	const { client, shared, detail, unrelated } = observedCaches();
	const { onClose, submit } = modal(kind, client);
	await submit();
	expect((await screen.findByRole('alert')).textContent).toContain(
		'This change was rejected.',
	);
	expect(onClose).not.toHaveBeenCalled();
	for (const entry of [...shared, detail, unrelated]) {
		expect(entry.refetch).not.toHaveBeenCalled();
		expect(client.getQueryData(entry.queryKey)).toEqual(entry.original);
		expect(client.getQueryState(entry.queryKey)?.isInvalidated).toBe(false);
	}
});

it.each([
	'edit',
	'delete',
] as const)('%s uses the shared API scope and selected account, not OIDC or accounts[0]', async kind => {
	const fetch = vi.spyOn(globalThis, 'fetch');
	const { onClose, submit } = modal(kind);
	await submit();
	await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	expect(msal.acquireTokenSilent).toHaveBeenCalledExactlyOnceWith({
		account: activeAccount,
		scopes,
	});
	expect(adapter).toHaveBeenCalledOnce();
	const config = adapter.mock.calls[0][0];
	expect(config.url).toBe('/api/sermons/12');
	expect(config.method).toBe(kind === 'edit' ? 'patch' : 'delete');
	expect(config.headers.Authorization).toBe('Bearer selected-api-token');
	expect(fetch).not.toHaveBeenCalled();
	if (kind === 'edit')
		expect(JSON.parse(config.data)).toEqual({
			title: 'Hope',
			tags: [{ name: 'hope' }],
		});
	else expect(screen.getByText('Sermon list')).toBeTruthy();
	expect(showToast).toHaveBeenCalledWith(
		kind === 'edit'
			? 'Sermon updated successfully'
			: 'Sermon deleted successfully',
		'success',
	);
});

it.each([
	'edit',
	'delete',
] as const)('%s displays API errors, keeps the modal open, and can retry', async kind => {
	adapter.mockImplementationOnce(async config => {
		throw new AxiosError('Denied', 'ERR_BAD_REQUEST', config, undefined, {
			data: { error: 'An administrator must approve this change.' },
			config,
			status: 403,
			statusText: 'Forbidden',
			headers: {},
		});
	});
	const { onClose, submit } = modal(kind);
	await submit();
	expect((await screen.findByRole('alert')).textContent).toContain(
		'An administrator must approve this change.',
	);
	expect(onClose).not.toHaveBeenCalled();
	expect(useAuth.getState().status).toBe('ready');
	expect(showToast).toHaveBeenCalledWith(
		'An administrator must approve this change.',
		'error',
	);
	await submit();
	await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	expect(adapter).toHaveBeenCalledTimes(2);
});

it.each([
	'edit',
	'delete',
] as const)('%s sends no request when token renewal fails and gives recovery feedback', async kind => {
	msal.acquireTokenSilent.mockRejectedValueOnce(
		new Error('interaction_required'),
	);
	const { onClose, submit } = modal(kind);
	await submit();
	expect((await screen.findByRole('alert')).textContent).toContain(
		kind === 'edit' ? 'Failed to update sermon' : 'Failed to delete sermon',
	);
	expect(adapter).not.toHaveBeenCalled();
	expect(onClose).not.toHaveBeenCalled();
	expect(useAuth.getState().status).toBe('reauthenticate');
	expect(useAuth.getState().message).toContain('sign in again');
	expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
});

it.each([
	'edit',
	'delete',
] as const)('%s enters shared session recovery when the API rejects the token', async kind => {
	adapter.mockImplementationOnce(async config => {
		throw new AxiosError('Expired', 'ERR_BAD_REQUEST', config, undefined, {
			data: { message: 'Please sign in again.' },
			config,
			status: 401,
			statusText: 'Unauthorized',
			headers: {},
		});
	});
	const { onClose, submit } = modal(kind);
	await submit();
	expect((await screen.findByRole('alert')).textContent).toContain(
		'Please sign in again.',
	);
	expect(useAuth.getState().status).toBe('reauthenticate');
	expect(onClose).not.toHaveBeenCalled();
});
