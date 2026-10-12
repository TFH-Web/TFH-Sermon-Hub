// Validate saved caption text and source times returned by the transcript endpoint.
import z from 'zod';

export const TranscriptSegment = z
	.object({
		start: z.number().nonnegative(),
		end: z.number().nonnegative(),
		text: z.string().nonempty(),
	})
	.refine(segment => segment.end > segment.start);
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;

export const Transcript = z.object({
	transcript: z.string().nullable(),
	segments: TranscriptSegment.array(),
});
export type Transcript = z.infer<typeof Transcript>;
