// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import ImportActivity from './ImportActivity';

afterEach(cleanup);

it('shows an unavailable message and none of the sample imports', () => {
	// No QueryClientProvider on purpose: the card reads no data, so a query added to it later would throw here.
	render(<ImportActivity />);

	expect(screen.getByRole('heading', { name: 'Import Activity' })).toBeTruthy();
	expect(screen.getByText('Import activity not available yet')).toBeTruthy();
	// What the dashboard listed before: made-up imports with a made-up 72% progress bar.
	for (const title of [
		'Batch Import YouTube Library',
		'Sermon Notes 2024 Archive',
		'Vimeo Import Legacy Content',
	]) {
		expect(screen.queryByText(title)).toBeNull();
	}
	expect(screen.queryByRole('progressbar')).toBeNull();
});
