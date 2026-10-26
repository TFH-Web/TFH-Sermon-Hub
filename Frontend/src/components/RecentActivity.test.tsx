// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import RecentActivity from './RecentActivity';

afterEach(cleanup);

it('shows an unavailable message and none of the sample entries', () => {
	render(<RecentActivity />);

	expect(screen.getByRole('heading', { name: 'Recent Activity' })).toBeTruthy();
	expect(screen.getByText('Activity history not available yet')).toBeTruthy();
	// What the dashboard listed before: made-up entries with made-up times.
	for (const sample of [
		'Under Grace',
		'Walking in Freedom',
		'Bold Faith',
		'Email sent',
	]) {
		expect(screen.queryByText(new RegExp(sample))).toBeNull();
	}
	expect(screen.queryAllByRole('listitem')).toHaveLength(0);
});
