// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from '@testing-library/react';
import axios from 'axios';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuth } from '$/lib/auth';
import SermonDetail from './SermonDetail';

vi.mock('$/components/MainLayout', () => ({
	default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('$/components/ToastContext', () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('react-youtube', () => ({
	default: ({ videoId }: { videoId: string }) => (
		<div data-testid="video-player" data-video-id={videoId} />
	),
}));

const originalAdapter = axios.defaults.adapter;
let client: QueryClient;

beforeEach(() => {
	useAuth.setState({
		status: 'ready',
		account: null,
		roles: ['Admin'],
		message: null,
	});
	client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
});
afterEach(() => {
	cleanup();
	client.clear();
	axios.defaults.adapter = originalAdapter;
});

async function show(videoLink: string, youtubeVideoId: string | null = null) {
	const sermon = {
		id: 1,
		title: 'Safe source test',
		videoLink,
		youtubeVideoId,
		duration: 60,
		date: '2026-10-25',
		description: 'A saved sermon.',
		tags: [],
		transcript: 'Saved caption text.',
		summary: null,
		status: 'Published',
		speaker: { id: 1, firstName: 'Dave', lastName: 'Patterson' },
		series: null,
	};
	axios.defaults.adapter = async config => {
		let data: unknown;
		if (config.url === '/api/sermons/1') data = sermon;
		else if (config.url === '/api/sermons') data = [sermon];
		else if (config.url === '/api/sermons/1/transcript')
			data = {
				transcript: sermon.transcript,
				segments: [{ start: 1.25, end: 3.5, text: sermon.transcript }],
			};
		else throw new Error(`Unexpected test request: ${config.url}`);
		return { data, config, status: 200, statusText: 'OK', headers: {} };
	};
	render(
		<QueryClientProvider client={client}>
			<MemoryRouter initialEntries={['/sermons/1']}>
				<Routes>
					<Route path="/sermons/:id" element={<SermonDetail />} />
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);
	await screen.findByRole('heading', { name: sermon.title, level: 1 });
	fireEvent.click(await screen.findByRole('button', { name: 'Timestamps' }));
	return screen.getByRole('region', { name: 'Sermon transcript' });
}

it.each([
	{ link: 'javascript:alert(1)', id: null },
	{
		link: 'https://www.youtube.com.evil.example/watch?v=abcdefghijk',
		id: null,
	},
	{ link: 'https://www.youtube.com/watch?v=abcdefghijk', id: 'different11' },
	{ link: 'https://www.youtube.com/watch?v=abcdefghijk', id: 'invalid' },
])('keeps captions readable but renders no player or source link for $link / $id', async ({
	link,
	id,
}) => {
	const transcript = await show(link, id);
	expect(screen.queryByTestId('video-player')).toBeNull();
	expect(screen.queryByRole('link', { name: 'Watch' })).toBeNull();
	expect(within(transcript).queryAllByRole('link')).toHaveLength(0);
	expect(within(transcript).getByText('Saved caption text.')).toBeTruthy();
	expect(within(transcript).getByTitle('Video unavailable')).toBeTruthy();
});

it.each([
	null,
	'abcdefghijk',
])('builds canonical watch and timestamp links for a valid saved source (%s)', async id => {
	const transcript = await show('https://youtu.be/abcdefghijk?si=legacy', id);
	expect(screen.getByTestId('video-player').getAttribute('data-video-id')).toBe(
		'abcdefghijk',
	);
	expect(screen.getByRole('link', { name: 'Watch' }).getAttribute('href')).toBe(
		'https://www.youtube.com/watch?v=abcdefghijk',
	);
	expect(
		within(transcript)
			.getByRole('link', { name: 'Watch from 0:01' })
			.getAttribute('href'),
	).toBe('https://www.youtube.com/watch?v=abcdefghijk&t=1s');
});
