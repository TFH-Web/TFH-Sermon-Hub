// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '$/lib/auth';
import AddSermon from './AddSermon';

// Only the floating button and its admin gate are under test, not the upload form itself.
vi.mock('$/modals/UploadSermonModal', () => ({
	default: ({ isOpen }: { isOpen: boolean }) =>
		isOpen ? <div role="dialog">Upload</div> : null,
}));

function signInAs(roles: string[]) {
	useAuth.setState({ status: 'ready', account: null, roles, message: null });
}

beforeEach(() => {
	signInAs([]);
});

afterEach(cleanup);

describe('AddSermon floating button', () => {
	it('renders nothing for someone who is not an admin', () => {
		const { container } = render(<AddSermon />);

		expect(container.firstChild).toBeNull();
	});

	it('shows the button, with the upload dialog closed, for an admin', () => {
		signInAs(['Admin']);

		render(<AddSermon />);

		expect(screen.getByRole('button', { name: '+' })).toBeTruthy();
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('opens the upload dialog when an admin clicks the button', async () => {
		signInAs(['Admin']);
		render(<AddSermon />);

		await userEvent.click(screen.getByRole('button', { name: '+' }));

		expect(screen.getByRole('dialog').textContent).toBe('Upload');
	});
});
