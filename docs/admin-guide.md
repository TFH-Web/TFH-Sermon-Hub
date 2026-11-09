# TFH Sermon Hub: administrator guide

Prepared November 8, 2026 for Tim and Pastor Michael. Louson owns the admin
handoff (TFH-674); review this guide against the accepted release before delivery.
Delivery and client acceptance have not yet been recorded.

## Sign in and access

Open the URL Jack provides and sign in with your own Microsoft account.
Current staging access needs the [SSH connection](deploying.md#open-private-staging-now)
arranged with Jack or Samip. The final production address is not active yet.

| Role | Access |
| --- | --- |
| Admin | Read the library and manage imports and sermon content. |
| InternalUser / Internal User | Read and search published sermons and use enabled AI features. No imports, edits or deletes. |
| No assigned staff role | Access is denied. Ask Jack/Tim to arrange the appropriate account role. |

Sign out when finished on a shared computer. If a permitted page says access is
denied, report the account and page to Jack; do not share passwords or tokens.

## Import a sermon

1. Open **Upload Sermon** from the Upload button or Import / Upload page.
2. Paste the YouTube video link and select **Import & Process**. Watch links,
   short `youtu.be` links and YouTube Shorts links are supported.
3. Check the saved title, speaker, series, date and description in the preview.
   Select **Open sermon** to review its page; use **Edit** for corrections.
4. Follow the result on **Import / Upload**. Active Imports shows queued or
   processing work, Import History shows published results, and Failed Imports
   shows saved errors with an Admin **Retry** action.

An existing video is reported as already imported. Private, missing, still-live
or over-limit videos can be refused with an explanation. Importing a record and
finishing its captions/AI processing are separate results.

For several sermons, use **Bulk Import**, choose **YouTube Channel**, set a
short date range and select **Sync from YouTube**. Leaving the range empty
requests the whole channel and can exhaust the shared caption quota. Only one
channel sync runs at a time. Review its report and **Sync History**, including
skipped videos and captions left waiting. Other listed sources currently show
Unavailable.

## Retry processing and handle a pause

Read the saved error before using **Retry**. Once the underlying issue is fixed,
retry the affected sermon once and follow its status. A transcript alone does
not establish that summaries and publication succeeded.

| Message or symptom | Action |
| --- | --- |
| YouTube sign-in expired | Ask Jack/Samip to renew the authorized YouTube connection, then retry. Repeated clicking will not renew it. |
| YouTube quota exceeded | Wait for the resume time shown, normally the next Pacific midnight, then retry. |
| Captions turned off or unavailable | Ask a maintainer to check caption availability and the configured processing switch. |
| AI/model/provider unavailable | Report the sermon and error to Jack/Samip; retry after they restore the provider. |
| Import is still active | Check its status rather than starting another import. |

As of November 8, staging embeddings and a real search sample are verified.
Anthropic summaries/chat and the complete new-import-to-Published flow still
need provider configuration and acceptance. Do not use staging to start an
unplanned full-library processing run.

## Edit, review and delete

On a sermon page select **Edit**. The current form saves title, speaker,
series, date, description and tags. Save, then reload and verify the result.
Some additional fields appear in the form but are not saved in this release;
ask a maintainer before relying on Series Index, Video Link, Sermon Notes or
Transcript edits. Editing a date can be reversed by a later YouTube sync.

Review transcript timestamps against the actual video. Arbitrary transcript
replacement is not a supported correction workflow because it could break
source timestamps. Report source/transcript problems with the sermon link.

Use **Delete** only for an approved record, check the selected sermon and its
confirmation, and cancel if uncertain. Deletion removes that sermon's record
and indexed evidence. Ask Jack to coordinate any recovery; do not assume an
Undo button or start another import as a substitute for recovery.

## Search and AI-generated content

Search published sermons, open a result and check that its timestamp reaches
the passage you expected. Once chat is enabled, use its numbered source links
to inspect the sermon moments behind an answer. An unsupported question may
receive a refusal rather than an answer.

**AI generated** means software produced the text; it does not establish that
the pastor reviewed or approved it. Check important claims against the cited
sermon, especially before sharing the text. Generated summaries are labeled
when their saved origin is known. Older text without a known origin should not
be assumed to be either AI-generated or pastor-approved. Corrections and
approved manual summaries must use the supported editing workflow.

## Handoff and support

Send Jack the page/sermon link, what you expected, the visible error and the
time it happened. Share credentials only through the maintainers' approved
private setup process. Jack coordinates access, recovery and client acceptance;
Samip maintains runtime/provider setup; Louson coordinates this guide's review
and delivery.

Server nightly backups and populated recovery were verified on November 8.
Recurring offsite copies still need an approved project destination. Contact
a maintainer for restoration or a release change. The final
[client acceptance record](testing/sprint9-client-acceptance.md) records the
approved release, guide delivery and Tim/Pastor Michael's actual decision.
