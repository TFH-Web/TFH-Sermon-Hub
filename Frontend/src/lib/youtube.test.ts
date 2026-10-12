import { describe, expect, it } from 'vitest';
import {
	normalizeYouTubeUrl,
	parseYouTubeVideoId,
	youtubeLinkError,
} from './youtube';

const ID = 'F_OiCiZ3Y3Y';

describe('parseYouTubeVideoId', () => {
	it.each([
		`https://www.youtube.com/watch?v=${ID}`,
		`https://youtube.com/watch?v=${ID}`,
		`https://m.youtube.com/watch?v=${ID}`,
		`http://www.youtube.com/watch?v=${ID}`,
		`https://www.youtube.com/watch?v=${ID}&t=30s`,
		`https://www.youtube.com/watch?list=PL123&v=${ID}`,
		`https://youtu.be/${ID}`,
		`https://youtu.be/${ID}?si=abc123`,
		`https://www.youtube.com/shorts/${ID}`,
		`  https://youtu.be/${ID}  `,
	])('reads the video id from %s', url => {
		expect(parseYouTubeVideoId(url)).toBe(ID);
	});

	it.each([
		'',
		ID,
		`youtu.be/${ID}`,
		'https://vimeo.com/123456789',
		'https://www.youtube.com/playlist?list=PL123',
		'https://www.youtube.com/@thefathershouse',
		`https://www.youtube.com/live/${ID}`,
		`https://music.youtube.com/watch?v=${ID}`,
		'https://youtu.be/tooShort',
		`https://youtu.be/${ID}X`,
	])('returns null for %j', url => {
		expect(parseYouTubeVideoId(url)).toBeNull();
	});
});

describe('normalizeYouTubeUrl', () => {
	it('adds https:// when the link has no scheme', () => {
		expect(normalizeYouTubeUrl(`youtu.be/${ID}`)).toBe(
			`https://youtu.be/${ID}`,
		);
	});

	it('leaves a link that already has a scheme alone', () => {
		expect(normalizeYouTubeUrl(`http://youtu.be/${ID}`)).toBe(
			`http://youtu.be/${ID}`,
		);
		expect(normalizeYouTubeUrl(`https://youtu.be/${ID}`)).toBe(
			`https://youtu.be/${ID}`,
		);
	});

	it('trims spaces and lowercases the scheme', () => {
		expect(normalizeYouTubeUrl(`  HTTPS://youtu.be/${ID}  `)).toBe(
			`https://youtu.be/${ID}`,
		);
	});
});

describe('youtubeLinkError', () => {
	it.each([
		`https://youtu.be/${ID}`,
		`https://www.youtube.com/watch?v=${ID}`,
		`youtube.com/watch?v=${ID}`,
		`  youtu.be/${ID}  `,
	])('accepts %j', link => {
		expect(youtubeLinkError(link)).toBeNull();
	});

	it.each(['', '   '])('asks for a link when given %j', link => {
		expect(youtubeLinkError(link)).toBe('Paste a YouTube link.');
	});

	it.each([
		'hello',
		'not a link',
		'https://vimeo.com/123456789',
	])('says %j is not a YouTube link', link => {
		expect(youtubeLinkError(link)).toBe('That is not a YouTube link.');
	});

	it.each([
		'https://www.youtube.com/playlist?list=PL123',
		'https://www.youtube.com/@thefathershouse',
		`https://www.youtube.com/live/${ID}`,
		`https://music.youtube.com/watch?v=${ID}`,
	])('says only video links are supported for %s', link => {
		expect(youtubeLinkError(link)).toMatch(/^Only video links are supported/);
	});
});
