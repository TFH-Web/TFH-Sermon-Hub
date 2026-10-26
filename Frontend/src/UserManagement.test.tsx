// @vitest-environment jsdom
import type { AccountInfo } from '@azure/msal-browser';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuth } from './lib/auth';
import UserManagement from './UserManagement';

vi.mock('$/components/MainLayout', () => ({
	default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('$/components/ToastContext', () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

beforeEach(() => {
	useAuth.setState({
		status: 'ready',
		account: {
			homeAccountId: 'test-admin',
			localAccountId: 'test-admin',
			username: 'admin@example.invalid',
			name: 'Test Admin',
		} as AccountInfo,
		roles: ['Admin'],
		message: null,
	});
});

afterEach(() => {
	cleanup();
	useAuth.setState({ status: 'signed-out', account: null, roles: [] });
	vi.restoreAllMocks();
});

it('renders the empty user list as a valid four-column table row with no unsupported actions', () => {
	const error = vi.spyOn(console, 'error');
	render(<UserManagement />);
	const table = within(screen.getByRole('table'));
	const row = table.getByRole('row', { name: 'No Users Found' });
	const cell = within(row).getByRole('cell', { name: 'No Users Found' });
	expect(cell.getAttribute('colspan')).toBe('4');
	expect(row.parentElement?.tagName).toBe('TBODY');
	expect(table.getAllByRole('columnheader')).toHaveLength(4);
	expect(table.getAllByRole('row')).toHaveLength(2);
	expect(
		screen.queryByRole('button', { name: /Add User|Edit|Remove/ }),
	).toBeNull();
	expect(error).not.toHaveBeenCalled();
});
