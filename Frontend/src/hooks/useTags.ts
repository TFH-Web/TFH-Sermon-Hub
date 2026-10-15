// Shared cache invalidation for tag mutations.
import type { QueryClient } from '@tanstack/react-query';

/**
 * Refetch everything a tag create/rename/delete can change: the tag list, the sermon filter's
 * tag options, the sermon lists, and any open sermon's own page.
 * The promise settles once the lists on screen have been refetched, for callers that want to wait for that.
 */
export function invalidateTagData(queryClient: QueryClient) {
	const stale = ['tags', 'paginated-tags', 'sermons', 'paginated-sermons', 'sermon'];
	return Promise.all(
		stale.map(key => queryClient.invalidateQueries({ queryKey: [key] })),
	);
}
