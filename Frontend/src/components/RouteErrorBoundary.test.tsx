// @vitest-environment jsdom
import type { AccountInfo } from '@azure/msal-browser';
import { InteractionStatus } from '@azure/msal-browser';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuth } from '$/lib/auth';
import ProtectedRoute from './ProtectedRoute';
import RouteErrorBoundary from './RouteErrorBoundary';
import { ToastProvider } from './ToastContext';

vi.mock('@azure/msal-react', () => ({
	useMsal: () => ({
		instance: { logoutRedirect: vi.fn() },
		inProgress: InteractionStatus.None,
	}),
}));

// Header imports react-router-dom, which Vitest loads as a separate router copy.
// Point it at react-router so the whole tree shares the MemoryRouter context.
vi.mock('react-router-dom', async () => await import('react-router'));

const account = {
	homeAccountId: 'one',
	localAccountId: 'one',
	username: 'staff@example.invalid',
	name: 'Staff Member',
} as AccountInfo;

beforeEach(() => {
	useAuth.setState({
		status: 'ready',
		account,
		roles: ['Internal User'],
		message: null,
	});
	// React logs the page error it catches; keep the test output readable.
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function BrokenPage(): never {
	throw new Error('page broke');
}

it.each([
	'signed-out',
	'reauthenticate',
] as const)('keeps the error page instead of blanking the app when the session becomes %s', status => {
	const { container } = render(
		<ToastProvider>
			<QueryClientProvider client={new QueryClient()}>
				<MemoryRouter initialEntries={['/broken']}>
					<RouteErrorBoundary>
						<Routes>
							<Route path="/login" element={<p>Sign in</p>} />
							<Route element={<ProtectedRoute />}>
								<Route path="/broken" element={<BrokenPage />} />
							</Route>
						</Routes>
					</RouteErrorBoundary>
				</MemoryRouter>
			</QueryClientProvider>
		</ToastProvider>,
	);
	expect(screen.getByText('Something broke on this page.')).toBeTruthy();
	expect(screen.getByText('Staff Member')).toBeTruthy();

	// The fallback's sidebar profile used to throw here, with no boundary above it.
	act(() => useAuth.setState({ status, account: null, roles: [] }));

	expect(container.textContent).not.toBe('');
	expect(screen.getByText('Something broke on this page.')).toBeTruthy();
	expect(screen.queryByText('Staff Member')).toBeNull();
});
