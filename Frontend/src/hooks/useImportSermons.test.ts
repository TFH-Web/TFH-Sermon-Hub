import {
	QueryClient,
	type QueryKey,
	QueryObserver,
} from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { IMPORT_SERMONS_KEY, invalidateSermonData } from './useImportSermons';

// Edit, delete and both kinds of import call invalidateSermonData, so these tests are what keeps the dashboard fresh
// for all of them. These are the queries the dashboard runs (see Dashboard.tsx); change them together.
// The tests check that these keys are refetched, not that they are the whole list, so other keys can be added.
const dashboardKeys = [
	['sermons', 'dashboard', { page: 1, pageSize: 5, sort: 'Newest' }],
	['series', 'count'],
	['speakers', 'count'],
] as const;

const original = { version: 1 };
const updated = { version: 2 };
const cleanups: Array<() => void> = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function createClient() {
	// Never stale, so only invalidating can cause a refetch, not subscribing to a query.
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: Infinity } },
	});
	cleanups.push(() => client.clear());
	return client;
}

/** Cache some data under a key and keep a query active on it, as a mounted page does. Only active queries are refetched. */
function observe(
	client: QueryClient,
	queryKey: QueryKey,
	refetch = vi.fn(async () => updated),
) {
	client.setQueryData(queryKey, original);
	const observer = new QueryObserver(client, { queryKey, queryFn: refetch });
	const unsubscribe = observer.subscribe(() => {});
	cleanups.push(() => {
		unsubscribe();
		observer.destroy();
	});
	return { queryKey, refetch };
}

it('refetches the dashboard totals and recent sermons', async () => {
	const client = createClient();
	const entries = dashboardKeys.map(key => observe(client, key));

	await invalidateSermonData(client);

	for (const { queryKey, refetch } of entries) {
		expect(refetch).toHaveBeenCalledOnce();
		expect(client.getQueryData(queryKey)).toEqual(updated);
	}
});

it('refetches the import and sermon lists too', async () => {
	const client = createClient();
	const entries = [
		[IMPORT_SERMONS_KEY, 'Published', 1],
		['sermons'],
		['paginated-sermons', { page: 2 }],
		['paginated-speakers', { page: 2 }],
	].map(key => observe(client, key));

	await invalidateSermonData(client);

	for (const { queryKey, refetch } of entries) {
		expect(refetch).toHaveBeenCalledOnce();
		expect(client.getQueryData(queryKey)).toEqual(updated);
	}
});

it('leaves unrelated queries alone', async () => {
	const client = createClient();
	const unrelated = observe(client, ['unrelated', 'dashboard']);

	await invalidateSermonData(client);

	expect(unrelated.refetch).not.toHaveBeenCalled();
	expect(client.getQueryData(unrelated.queryKey)).toEqual(original);
	expect(client.getQueryState(unrelated.queryKey)?.isInvalidated).toBe(false);
});

it('resolves only after the refetches have finished', async () => {
	// DeleteSermonModal awaits this before it leaves the page, so it must not settle early.
	const client = createClient();
	let release!: () => void;
	const gate = new Promise<void>(resolve => {
		release = resolve;
	});
	const slow = vi.fn(async () => {
		await gate;
		return updated;
	});
	const [key] = dashboardKeys;
	observe(client, key, slow);

	let settled = false;
	const done = invalidateSermonData(client).then(() => {
		settled = true;
	});
	await vi.waitFor(() => expect(slow).toHaveBeenCalledOnce());
	expect(settled).toBe(false);

	release();
	await done;
	expect(settled).toBe(true);
	expect(client.getQueryData(key)).toEqual(updated);
});
