import MurmurHash3 from 'imurmurhash';
import z from 'zod';

export const Speaker = z.object({
	id: z.number(),
	firstName: z.string().nonempty(),
	lastName: z.string().nonempty(),
	role: z.string().nonempty(),
});
export type Speaker = z.infer<typeof Speaker>;

export const CountedSpeaker = z.object({
	...Speaker.shape,
	sermonCount: z.number().nonnegative(),
});
export type CountedSpeaker = z.infer<typeof CountedSpeaker>;

export function getFullName(speaker: Speaker): string {
	return `${speaker.firstName} ${speaker.lastName}`;
}

export function getInitials(speaker: Speaker): string {
	const firstInitial = speaker.firstName[0];
	const lastInitial = speaker.lastName[0];
	const initials = `${firstInitial.toUpperCase()}${lastInitial.toUpperCase()}`;
	return initials;
}

export function speakerHue(u: Speaker): number {
	const digest = u.id + getFullName(u);
	const hue = MurmurHash3(digest).result() % 360;
	return hue;
}
