// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import Notifications from './Notifications';

vi.mock('$/components/MainLayout', () => ({
	default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

it('says email notifications are unavailable instead of showing a sample email', () => {
	const error = vi.spyOn(console, 'error');
	render(<Notifications />);

	expect(screen.getByText('Unavailable')).toBeTruthy();
	expect(
		screen.getByText(
			'Email notifications are not available in this release. No emails are sent.',
		),
	).toBeTruthy();

	// No invented email, recipient, sermon or sent-notification claim.
	const text = document.body.textContent ?? '';
	expect(text).not.toMatch(/Email Preview|Recent Notifications Sent/);
	expect(text).not.toMatch(/@|Subject:|From:|To:/);
	expect(text).not.toMatch(/Under Grace|Dave Patterson|4,218|Hi Samip/);
	expect(text).not.toMatch(/Emails are sent only/);
	expect(screen.queryByRole('button')).toBeNull();
	expect(error).not.toHaveBeenCalled();
});
