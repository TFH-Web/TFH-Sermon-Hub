import z from 'zod';

export const PageInfo = z.object({
	page: z.number().int().positive(),
	pageSize: z.number().int().positive(),
	total: z.number().int().nonnegative(),
	totalPages: z.number().int().nonnegative(),
});
export type PageInfo = z.infer<typeof PageInfo>;

export interface PaginatedResponse<T> extends PageInfo {
	items: T[];
}
