export function hash(s: string): number {
	// Adopted from github/hyamamoto
	// https://gist.github.com/hyamamoto/fd435505d29ebfa3d9716fd2be8d42f0

	let h = 0;
	if (s.length > 0) {
		for (let i = 0; i < s.length; i++) {
			h = (h << 5) - h + s.charCodeAt(i);
		}
	}
	return h;
}
