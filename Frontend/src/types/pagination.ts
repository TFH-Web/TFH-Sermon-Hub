import z from 'zod';
import type * as z4 from 'zod/v4/core';

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

export function paginated<T extends z4.$ZodArray>(schema: T) {
	return PageInfo.extend({
		items: schema,
	});
}
