// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchApiResult } from '$/hooks/useAISearchRequest';
import { mapSearchResult } from '$/lib/aiSearch';
import AISearchPreviewCard from './AISearchPreviewCard';

// The placeholder icon is not under test, and the real one renders asynchronously.
vi.mock('@iconify-icon/react', () => ({ Icon: () => null }));

afterEach(cleanup);

const base: SearchApiResult = {
	id: 1,
	title: 'Faith Over Fear',
	type: 'sermon',
	speaker: 'Dave Patterson',
	date: '2026-09-27',
	summary: 'Trusting God.',
	ai_score: 0.9,
};

function renderCard(overrides: Partial<SearchApiResult>) {
	render(
		<MemoryRouter>
			<AISearchPreviewCard
				result={mapSearchResult({ ...base, ...overrides }, 'faith')}
				onOpen={() => {}}
			/>
		</MemoryRouter>,
	);
	return screen.getByRole('img', { name: 'Faith Over Fear preview' });
}

describe('AISearchPreviewCard thumbnail', () => {
	it('prefers the thumbnail the result provides', () => {
		const image = renderCard({
			thumbnailUrl: '/images/faith.jpg',
			youtube_video_id: 'F_OiCiZ3Y3Y',
			video_link: 'https://www.youtube.com/watch?v=F_OiCiZ3Y3Y',
		});
		expect(image.getAttribute('src')).toBe('/images/faith.jpg');
	});

	it('uses the YouTube thumbnail for the result video', () => {
		const image = renderCard({
			youtube_video_id: 'F_OiCiZ3Y3Y',
			video_link: 'https://www.youtube.com/watch?v=F_OiCiZ3Y3Y',
		});
		expect(image.getAttribute('src')).toBe(
			'https://i.ytimg.com/vi/F_OiCiZ3Y3Y/hqdefault.jpg',
		);
	});

	it('shows a local placeholder without a thumbnail or video', () => {
		const image = renderCard({});
		expect(image.tagName).toBe('DIV');
		expect(document.querySelector('img')).toBeNull();
	});
});
