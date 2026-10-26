// Match the entire ID, including rejecting a trailing newline.
const VIDEO_ID = /^[A-Za-z0-9_-]{11}(?![\s\S])/;

const WATCH_HOSTS = new Set([
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
]);

// Include music.youtube.com only to explain unsupported links in the form.
const YOUTUBE_HOSTS = new Set([
	...WATCH_HOSTS,
	'youtu.be',
	'music.youtube.com',
]);

// Read only the URL shapes accepted by the backend.
export function parseYouTubeVideoId(input: string): string | null {
	const text = input.trim();

	// Reject spaces, control characters, non-ASCII characters and backslashes.
	if (
		[...text].some(character => {
			const code = character.charCodeAt(0);
			return code <= 32 || code >= 127 || character === '\\';
		})
	) {
		return null;
	}

	// Read the original host and path without silently normalizing them.
	const match = /^https?:\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i.exec(
		text,
	);

	if (!match) return null;

	const host = match[1].toLowerCase();
	const path = match[2];
	const query = match[3] ?? '';

	// Exact host matching also rejects credentials and explicit ports.
	if (WATCH_HOSTS.has(host)) {
		if (path === '/watch') {
			const ids = new URLSearchParams(query).getAll('v');
			return ids.length === 1 && VIDEO_ID.test(ids[0]) ? ids[0] : null;
		}

		const shorts = /^\/shorts\/([A-Za-z0-9_-]{11})\/?$/.exec(path);
		return shorts?.[1] ?? null;
	}

	if (host === 'youtu.be') {
		const shortLink = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(path);
		return shortLink?.[1] ?? null;
	}

	return null;
}

// Build links from a validated ID instead of displaying the original URL.
export function buildYouTubeWatchUrl(videoId: string): string | null {
	if (!VIDEO_ID.test(videoId)) return null;
	return `https://www.youtube.com/watch?v=${videoId}`;
}

export function buildYouTubeEmbedUrl(videoId: string): string | null {
	if (!VIDEO_ID.test(videoId)) return null;
	return `https://www.youtube.com/embed/${videoId}`;
}

// External YouTube links use whole seconds, matching the backend.
export function buildYouTubeSourceUrl(
	videoId: string,
	startSeconds: unknown,
): string | null {
	const watchUrl = buildYouTubeWatchUrl(videoId);
	if (!watchUrl) return null;

	const seconds =
		typeof startSeconds === 'number' &&
		Number.isFinite(startSeconds) &&
		startSeconds >= 0
			? Math.floor(startSeconds)
			: 0;

	return `${watchUrl}&t=${seconds}s`;
}

/** Trim a pasted link and add https:// when it has no scheme, since the endpoint only accepts full URLs. */
export function normalizeYouTubeUrl(input: string): string {
	const trimmed = input.trim();
	if (/^https?:\/\//i.test(trimmed)) {
		return trimmed.replace(/^https?:\/\//i, scheme => scheme.toLowerCase());
	}
	return `https://${trimmed}`;
}

/** Return why a pasted link cannot be imported, or null when it is a supported YouTube video link. */
export function youtubeLinkError(input: string): string | null {
	if (!input.trim()) return 'Paste a YouTube link.';

	const url = normalizeYouTubeUrl(input);
	if (parseYouTubeVideoId(url)) return null;

	// A YouTube page that is not a single video, e.g. a playlist, a channel or a /live/ link.
	if (isYouTubeHost(url)) {
		return 'Only video links are supported: youtube.com/watch?v=…, youtu.be/… or youtube.com/shorts/…';
	}
	return 'That is not a YouTube link.';
}

function isYouTubeHost(url: string): boolean {
	try {
		return YOUTUBE_HOSTS.has(new URL(url).hostname);
	} catch {
		return false;
	}
}

// Older records can use their valid link when no stored ID exists.
// Refuse invalid links, invalid IDs, or IDs that disagree.
export function resolveYouTubeVideoId(sermon: {
	videoLink: string;
	youtubeVideoId?: string | null;
}): string | null {
	const linkId = parseYouTubeVideoId(sermon.videoLink);

	if (!linkId) return null;

	if (sermon.youtubeVideoId == null) {
		return linkId;
	}

	return VIDEO_ID.test(sermon.youtubeVideoId) &&
		sermon.youtubeVideoId === linkId
		? linkId
		: null;
}
