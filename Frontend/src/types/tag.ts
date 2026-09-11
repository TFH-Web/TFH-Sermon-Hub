import z from 'zod';

export const Tag = z.object({
	name: z.string(),
	source: z.enum(['ai', 'manual']),
});
export type Tag = z.infer<typeof Tag>;

export const CountedTag = z.object({
	...Tag.shape,
	count: z.number().nonnegative(),
});
export type CountedTag = z.infer<typeof CountedTag>;
