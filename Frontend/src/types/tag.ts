import z from 'zod';
import { paginated } from './pagination';

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

export const PaginatedTags = paginated(CountedTag.array());
export type PaginatedTags = z.infer<typeof PaginatedTags>;
