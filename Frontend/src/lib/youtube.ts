// Check YouTube links the way the import endpoint does, so the modal never sends one it would reject.
// The same three shapes as VIDEO_URL_PATTERNS in Backend/tsh/youtube_import.py. A video id is 11 characters.
const VIDEO_URL_PATTERNS = [
	/^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})(?:[&#].*)?$/,
	/^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?:[?#].*)?$/,
	/^https?:\/\/(?:www\.|m\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{11})(?:[?#/].*)?$/,
];
const YOUTUBE_HOSTS = new Set([
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'music.youtube.com',
	'youtu.be',
]);

/** Return the video id from a youtube.com/watch?v=, youtu.be/ or youtube.com/shorts/ URL, or null if it is not one. */
export function parseYouTubeVideoId(url: string): string | null {
	for (const pattern of VIDEO_URL_PATTERNS) {
		const match = pattern.exec(url.trim());
		if (match) return match[1];
	}
	return null;
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
