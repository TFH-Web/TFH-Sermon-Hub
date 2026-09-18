# Sermons filtering and shared pagination contract

This documents the Pagination that is implemented for `/api/sermons`; Speakers, Tags, and Series can reuse this contract and the controls when their stories are implemented.

## API

Pagination is opt-in: supplying `page` returns a paginated object. Without `page`, the endpoint returns the complete matching array, preserving Dashboard and Series consumers. Supplying only a page size does not enable pagination.

Example:

```text
GET /api/sermons?page=1&pageSize=9&status=Published&topic=grace&speaker_id=1&series_id=1&sort=Newest
```

| Parameter | Behavior |
| --- | --- |
| `page` | Integer at least 1. Invalid values return JSON HTTP 400. |
| `pageSize` | Defaults to 10; positive values above 100 are capped at 100. Nonempty invalid values return JSON HTTP 400. An empty value falls back to an alias or the default. Aliases: `page_size`, `per_page`. |
| `status` | Case-insensitive status name/value: Published, Processing, Draft, Failed. Unknown values return no matches. |
| `topic` | Case-insensitive tag name. Alias: `tag`. |
| `speaker_id` | Speaker ID or full name. Aliases: `speakerId`, `speaker`. |
| `series_id` | Series ID or title. Aliases: `seriesId`, `series`. |
| `sort` | `Oldest` sorts by date then ID ascending. `Newest`, `Relevance`, and other values sort descending. Case-insensitive; defaults to Newest. |

Omit inactive filters. Filters combine with AND and apply in the database before counting or paging. Tag filtering uses an existence check to avoid duplicate sermons. Relevance retains its existing newest-first behavior; there is no relevance ranking.

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 9,
  "totalPages": 0
}
```

`total` is the full matching count. `totalPages` is the ceiling of total divided by page size, or zero for no matches. The response also includes aliases `sermons` for `items`, `page_size`, and `total_pages`.

Empty and out-of-range requests return HTTP 200 with empty items, accurate totals, and the requested page number. Validation errors contain `error` and `message` fields. Sermon item fields and the detail endpoint are unchanged.

## Sermons page

`Frontend/src/Sermons.tsx` requests nine sermons per page and renders the returned items without local filtering or sorting. Its cache key is:

```ts
['paginated-sermons', { page, pageSize, status, topic, speakerID, seriesID, sort }]
```

The full-library `['sermons']` cache remains separate. Filters and sorting persist during page changes; changing any selection resets the page to 1. State is local to the page, not persisted across refreshes.

Filter choices load separately from `/api/speakers`, `/api/series`, and `/api/tags`. These requests remain unpaginated. The existing tags endpoint returns tags used by sermons, excluding unused tags. Choices are independent of the displayed sermon page and active filters.

The page waits for filter choices before enabling controls. Failed filter requests show the shared ErrorBox with refresh instructions, rather than silently displaying empty choices. The app query provider obtains the toast callback inside a React component so failed requests do not trigger an invalid hook call.

## Shared controls

`Frontend/src/components/Pagination.tsx` accepts `page` and `totalPages`, or a `pageInfo` object defined in `Frontend/src/types/pagination.ts`, plus `onPageChange`. Optional `isLoading` and `disabled` flags disable navigation. `className` supports styling; the accepted `total` and `pageSize` props are not currently displayed.

The component renders Previous, Next, and current-page feedback. It handles first, last, single, empty, and loading states; empty results display `Page 0 of 0`. It contains no API calls or sermon-specific logic.

## Verification

- Backend tests cover filters, combined/no-match results, totals, pagination, validation, stable sorting, and legacy responses.
- Vitest covers response validation and shared control rendering.
- `Frontend/e2e/sermons.spec.ts` exercises the real page with mocked API responses: every filter/sort resets the page and persists in subsequent requests, each metadata failure displays an error and recovers on refresh, and Dashboard keeps its complete library count.
- Browser fixtures test frontend wiring; database filtering is verified by backend tests.

Run from the respective directories:

```text
Backend:  poetry run pytest -q
Frontend: npm test
Frontend: npm run build
Frontend: npx playwright test e2e/sermons.spec.ts --project=chromium
```
