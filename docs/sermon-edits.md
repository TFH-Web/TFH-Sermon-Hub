# Sermon edits and index consistency (TFH-539)

Admin-only `PATCH /api/sermons/:id` accepts metadata (`title`, `date`, `duration`,
`description`, existing speaker/series/tag relationships), a manual `summary`,
and a validated `videoLink`/`youtubeVideoId`. Partial updates use the schema's
validated internal field names. Omitted fields stay unchanged.

On the sermon page, the Edit Sermon modal sends `title`, `speaker` and `series`
(by id, `series` is `null` for none), `date`, `description` and `tags` with each
save. The speakers and series it offers come from `GET /api/speakers` and
`GET /api/series`. Title, speaker and description are required; a cleared date is
left out so the saved date stays. The form also has Series Index, Video Link,
Sermon Notes and Transcript fields, but they are not part of the save.

Metadata and manual-summary edits preserve saved transcript cues, chunk IDs and
embeddings. Alternate links for the same video only canonicalize the URL; they
do not discard evidence or spend provider quota.

A different video invalidates the old transcript, timed cues, summary, generated
tag associations, storage/audio references, chunks and vectors. Manual tags and
unrelated sermons remain intact. The sermon becomes Draft, and old regeneration
state is reset. The change does not call YouTube/AI or automatically enqueue a
job: use the existing explicit Reprocess flow when ready. Save a video replacement
before submitting a new manual summary for it.

`summarySource` is server-owned (`ai`, `manual`, or null for unknown legacy
origin). Successful generation records `ai` with the saved summary and tags.
Explicit nonblank manual summary saves record `manual`, including edits to a
previously generated summary. Omitting the summary preserves its saved origin.
Clearing the summary or replacing its video clears its origin;
failed saves or generation leave the saved origin intact. The detail page labels
only a nonempty summary with known `ai` origin as “AI generated”; old text is
never retroactively assumed to be generated.

Untimed `transcript` edits and client-supplied `transcriptSegments` are rejected
with JSON 422: this API cannot safely map arbitrary replacement text to video
timestamps. Processing status, error/timestamp/storage fields and regeneration
or origin metadata are server-owned, not manual-edit fields. Unknown fields are
also rejected; they are never silently ignored with a successful response.

Source changes and manual summaries return JSON 409 while full processing or
summary regeneration is active. Ordinary metadata edits remain available. This
prevents a queued/running worker from overwriting a newly replaced source or
manual summary.

`DELETE /api/sermons/:id` explicitly deletes the selected sermon's vec0 rows
before its chunks, associations and record. sqlite-vec does not implement foreign
key cascades. Cleanup and source invalidation share the sermon transaction; a
database failure rolls everything back. Cleanup never deletes other sermons or
shared speaker/series/tag definitions.

`tests/test_sermon_edit_consistency.py` exercises the actual Flask API and
in-memory sqlite-vec tables with fixed embeddings: persistence, metadata
preservation, source invalidation, raw vector orphan checks, unrelated data,
worker conflicts, rejected payloads, transaction rollback and 401/403/404.
Vector checks read vec0 directly rather than joining through deleted chunks,
which would hide orphan records. Run from Backend:

```sh
poetry run pytest -q tests/test_sermon_edit_consistency.py tests/test_sermon_transcript_edits.py tests/test_api.py
```
