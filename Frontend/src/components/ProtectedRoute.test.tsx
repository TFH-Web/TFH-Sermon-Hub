// @vitest-environment jsdom
import { InteractionStatus } from '@azure/msal-browser';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuth } from '$/lib/auth';
import Navbar from './Navbar';
import ProtectedRoute from './ProtectedRoute';

vi.mock('@azure/msal-react', () => ({
	useMsal: () => ({ inProgress: InteractionStatus.None }),
}));
beforeEach(() =>
	useAuth.setState({
		status: 'ready',
		roles: ['Internal User'],
		message: null,
	}),
);
afterEach(cleanup);
function Login() {
	return <p>Sign in to return to {useLocation().state?.returnTo}</p>;
}
function page(adminOnly = false) {
	return render(
		<MemoryRouter initialEntries={['/sermons/12?q=hope#video']}>
			<Routes>
				<Route path="/login" element={<Login />} />
				<Route path="/" element={<p>Home</p>} />
				<Route element={<ProtectedRoute adminOnly={adminOnly} />}>
					<Route path="/sermons/12" element={<p>Staff page</p>} />
				</Route>
			</Routes>
		</MemoryRouter>,
	);
}
it('preserves deep links when a session is lost', () => {
	useAuth.setState({ status: 'reauthenticate', roles: [] });
	page();
	expect(
		screen.getByText('Sign in to return to /sermons/12?q=hope#video'),
	).toBeTruthy();
});
it('shows a loading state while verifying a session', () => {
	useAuth.setState({ status: 'loading' });
	page();
	expect(screen.getByRole('status').textContent).toContain('Checking');
	expect(screen.queryByText('Staff page')).toBeNull();
});
it('allows verified staff reads but not Admin routes', () => {
	page(true);
	expect(screen.getByText('Home')).toBeTruthy();
});
it('allows Admin routes for a verified Admin', () => {
	useAuth.setState({ roles: ['Admin'] });
	page(true);
	expect(screen.getByText('Staff page')).toBeTruthy();
});
it('hides Admin navigation from read-only staff', () => {
	render(
		<MemoryRouter>
			<Navbar />
		</MemoryRouter>,
	);
	expect(screen.queryByRole('link', { name: 'Import / Upload' })).toBeNull();
	expect(screen.queryByRole('link', { name: 'User Management' })).toBeNull();
	expect(screen.getByRole('link', { name: 'Tags & Metadata' })).toBeTruthy();
});
it('shows Admin navigation to an Admin', () => {
	useAuth.setState({ roles: ['Admin'] });
	render(
		<MemoryRouter>
			<Navbar />
		</MemoryRouter>,
	);
	expect(screen.getByRole('link', { name: 'Import / Upload' })).toBeTruthy();
});
