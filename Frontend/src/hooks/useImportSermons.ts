// Sermon lists for the Import page, by status, and the polling that keeps them current while sermons are processing.
import {
	keepPreviousData,
	type QueryClient,
	useQuery,
} from '@tanstack/react-query';
import axios from 'axios';
import { PaginatedSermons, type Status } from '$/types/sermon';

export const IMPORT_SERMONS_KEY = 'import-sermons';
const PAGE_SIZE = 10;
const BUSY_INTERVAL = 3000;
// Often enough to notice work started somewhere else: a queued sync, the CLI, another admin.
const IDLE_INTERVAL = 15000;

async function fetchSermons(status: Status, page: number, pageSize: number) {
	const response = await axios.get('/api/sermons', {
		params: { status, page, pageSize },
	});
	return PaginatedSermons.parseAsync(response.data);
}

/** One page of the sermons with a status. Refetches every few seconds while poll is true. */
export function useImportSermons(status: Status, page: number, poll: boolean) {
	return useQuery({
		queryKey: [IMPORT_SERMONS_KEY, status, page],
		queryFn: () => fetchSermons(status, page, PAGE_SIZE),
		// Keep the rows on screen while another page loads.
		placeholderData: keepPreviousData,
		// Every failed fetch raises a toast (see main.tsx) that stays until closed, so stop polling after one.
		refetchInterval: query =>
			poll && query.state.status !== 'error' ? BUSY_INTERVAL : false,
	});
}

/** How many sermons are processing right now. Checks often while there are some, and now and then when there are none. */
export function useProcessingCount(): number {
	const query = useQuery({
		queryKey: [IMPORT_SERMONS_KEY, 'Processing', 'count'],
		queryFn: async () => {
			try {
				// Only the total is needed, so ask for the smallest page.
				return (await fetchSermons('Processing', 1, 1)).total;
			} catch {
				// A background check. The lists report their own errors, so stay quiet and try again at the idle rate.
				return 0;
			}
		},
		refetchInterval: query =>
			(query.state.data ?? 0) > 0 ? BUSY_INTERVAL : IDLE_INTERVAL,
	});
	return query.data ?? 0;
}

/** Refetch everything a new or reprocessed sermon can change: the import lists, the sermon lists, and series and speakers. */
export function invalidateSermonData(queryClient: QueryClient) {
	const stale = [
		IMPORT_SERMONS_KEY,
		'sermons',
		'paginated-sermons',
		'series',
		'speakers',
		'paginated-speakers',
	];
	for (const key of stale) {
		queryClient.invalidateQueries({ queryKey: [key] });
	}
}
