// @vitest-environment jsdom
import { InteractionStatus } from '@azure/msal-browser';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LoginPage from './LoginPage';
import { useAuth } from './lib/auth';

const { loginRedirect, msalState } = vi.hoisted(() => ({
	loginRedirect: vi.fn(),
	msalState: { inProgress: 'none' },
}));
vi.mock('@azure/msal-react', () => ({
	useMsal: () => ({
		instance: { loginRedirect },
		inProgress: msalState.inProgress,
	}),
}));
vi.mock('./authConfig', () => ({ apiScopes: ['api://test/access_as_user'] }));

beforeEach(() => {
	useAuth.setState({
		status: 'signed-out',
		account: null,
		roles: [],
		message: null,
	});
	loginRedirect.mockReset().mockResolvedValue(undefined);
	msalState.inProgress = InteractionStatus.None;
});
afterEach(cleanup);

function page(returnTo = '/sermons/12') {
	return render(
		<MemoryRouter
			initialEntries={[{ pathname: '/login', state: { returnTo } }]}
		>
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route path="/sermons/12" element={<p>Returned to sermon</p>} />
				<Route path="/" element={<p>Home</p>} />
			</Routes>
		</MemoryRouter>,
	);
}

it('renders real sign-in with no demo/approval controls', () => {
	page();
	expect(
		screen.getByRole('button', { name: 'Sign in with Microsoft' }),
	).toBeTruthy();
	expect(screen.queryByText('Demo Scenario')).toBeNull();
	expect(screen.queryByText('Resend Approval Request')).toBeNull();
});
it('requests the API scope and preserves a local deep link', async () => {
	page();
	await userEvent.click(
		screen.getByRole('button', { name: 'Sign in with Microsoft' }),
	);
	expect(loginRedirect).toHaveBeenCalledWith(
		expect.objectContaining({
			scopes: ['api://test/access_as_user'],
			redirectStartPage: `${window.location.origin}/sermons/12`,
		}),
	);
});
it('shows a recoverable sign-in failure and retries', async () => {
	loginRedirect.mockRejectedValueOnce(new Error('provider failure'));
	page();
	await userEvent.click(
		screen.getByRole('button', { name: 'Sign in with Microsoft' }),
	);
	expect(await screen.findByRole('alert')).toHaveProperty(
		'textContent',
		expect.stringContaining('Please try again'),
	);
	await userEvent.click(
		screen.getByRole('button', { name: 'Sign in with Microsoft' }),
	);
	await waitFor(() => expect(loginRedirect).toHaveBeenCalledTimes(2));
});
it('opens the real account picker and blocks an external return URL', async () => {
	page('//attacker.invalid');
	await userEvent.click(
		screen.getByRole('button', { name: 'Use a different account' }),
	);
	expect(loginRedirect).toHaveBeenCalledWith(
		expect.objectContaining({
			prompt: 'select_account',
			redirectStartPage: `${window.location.origin}/`,
		}),
	);
});
it('disables duplicate sign-in while Microsoft interaction is in progress', () => {
	msalState.inProgress = InteractionStatus.AcquireToken;
	page();
	expect(screen.getByRole('button', { name: 'Signing in…' })).toHaveProperty(
		'disabled',
		true,
	);
	expect(screen.getByRole('status').textContent).toContain('Connecting');
});
it('returns a verified session to the requested page', () => {
	useAuth.setState({ status: 'ready' });
	page();
	expect(screen.getByText('Returned to sermon')).toBeTruthy();
});
it('explains missing role access without inventing approval states', () => {
	useAuth.setState({
		status: 'forbidden',
		message: 'Ask an administrator for a staff role.',
	});
	page();
	expect(screen.getByRole('alert').textContent).toContain('staff role');
	expect(
		screen.getByRole('button', { name: 'Use a different account' }),
	).toBeTruthy();
});
